# OVYX AI — Cloudflare free-only production routing

## Production rule

OVYX production AI routes use **Cloudflare Workers AI first**. They never call OVYX's platform-paid provider keys as a fallback and never accept API keys from browser requests. Web Studio may offer a user-controlled retry through that member's own active Universal Connection when either the Cloudflare daily free allocation / OVYX safety budget is exhausted, or that member's included monthly AI tokens and daily OVYX prompts are exhausted. No other feature gets this fallback, and temporary rate limits, timeouts, configuration errors or general provider outages do not trigger it.

This is deliberately fail-closed. If the engine mode is absent or incorrect, central AI routing refuses to call any provider, and public AI endpoints return a configuration error. The old provider-router is available to tests and isolated maintenance only when both `OVYX_AI_ENGINE_MODE=legacy-provider-routing` and `OVYX_ALLOW_PAID_PROVIDER_ROUTING=true` are set. **Do not set those variables in production.**

## Configure the Cloudflare Pages project

1. In Cloudflare Dashboard, open **Workers & Pages → your OVYX Pages project → Settings → Bindings**.
2. Add a **Workers AI** binding with variable name exactly `AI`.
3. In the project's environment variables, set `OVYX_AI_ENGINE_MODE=cloudflare-free-only`.
4. Keep the Cloudflare account on the **Workers Free plan** if zero Workers AI overage spending is a hard requirement. Redeploy the Pages project after the binding/configuration change.

Official setup instructions: [Cloudflare Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/).

## Daily Neuron safety budget

- Cloudflare publishes a free allowance of **10,000 Neurons per account per UTC day**. It resets at 00:00 UTC. It is account-wide, not 10,000 per OVYX member. Cloudflare rejects further free-plan requests when the allowance is exhausted; upgrading to Workers Paid enables billable usage beyond the included amount. See [official pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and [error codes](https://developers.cloudflare.com/workers-ai/platform/errors/).
- OVYX maintains its own compare-and-swap ledger in the existing Firestore `system/config` document. It reserves a conservative estimate before every inference and settles the estimate after a successful response. If the ledger cannot be read/written, OVYX does not call the model.
- The default OVYX safety cap is **7,000 estimated Neurons per UTC day** and is hard-capped in code at **8,000**. The unused amount is a reserve for estimation error or other workloads on the same Cloudflare account. A lower limit can be set with `OVYX_WORKERS_AI_DAILY_NEURON_BUDGET`; that variable cannot raise the code-enforced 8,000 cap.
- Neuron usage is estimated from the chosen model's published input/output rates and response usage metadata when available. This estimate is not Cloudflare's official usage meter; other projects on the same Cloudflare account can consume the shared free allocation. The Cloudflare Free plan's own daily limit remains the final no-overage backstop.
- The fixed model is `@cf/qwen/qwen3-30b-a3b-fp8`, using the published rate of 4,625 Neurons/M input tokens and 30,475 Neurons/M output tokens at implementation time. The browser cannot override the model or output-token cap. Output is capped at 4,096 tokens per inference. Benchmark real website quality in the next quality stage before claiming production-grade results.
- Per-member AI calls are rate-limited to 18 request reservations per minute by default, with a code maximum of 30. Existing OVYX token/prompt quotas remain in force as an additional per-member limit.

## Subscription gate

The Pages API middleware checks authentication, then resolves the authoritative server-side entitlement record. Only a `pro` or `max` tier with state `active`, a valid future expiry, and `accessActive=true` may use AI routes. The canonical ROOT superuser may bypass the paid-subscription check for owner testing. Browser plan values, local storage, URL parameters, or client-provided booleans cannot unlock the engine.

The gate covers the main assistant, OVYX native AI, AI gateway, web research, Agent generation, and AI tool execution. Subscription/entitlement storage failures deny the request instead of trusting stale browser state.

## Security and failure behaviour

- All inference passes through the Cloudflare `AI` binding on the server.
- Public AI routes require `OVYX_AI_ENGINE_MODE=cloudflare-free-only`; a missing binding, missing budget ledger, unavailable entitlement store, per-member rate limit, or budget cap returns a clear error.
- There is no silent platform-paid-provider or local-model fallback. A member's own Universal Connection is allowed only for Web Studio after daily free AI capacity or that member's included OVYX quota is exhausted, and only after explicit user consent in the Web Studio popup.
- The preference is remembered in the current browser tab only until the UTC day changes. Cloudflare is still tried first while its daily allowance is available; a personal connection is not called early unless the member's own monthly + daily OVYX allowance is exhausted.
- Personal-key generation is not deducted from OVYX's monthly token counter or daily prompt allowance, preventing double charging. Member-owned Universal Connection requests still share OVYX's server-side per-member request-rate limiter, and the external provider may charge according to its own pricing and quota.
- Universal Connection routing requires the authenticated user's own active AI-compatible connection. OVYX verifies owner UID/email, active state and supported AI protocol; credentials stay encrypted on the server and are never returned to the browser.
- Universal Connection slot caps are enforced server-side: Free 3 active connections, Pro 5, Max unlimited, and expired/canceled/unverified paid subscriptions fall back to the Free cap.
- App Studio does not inherit Web Studio's personal-key quota fallback. Its feature entitlement is checked separately, and the default Free plan cannot use App Studio; paid-plan owner configuration remains authoritative for Pro/Max features.
- Existing authentication, project authorization, request validation, per-user quota accounting, history, and safe-write checks remain in the existing routes.
- The per-user request counter and global Neuron ledger use Firestore update-time compare-and-swap writes to reduce double reservation under concurrent requests.
- A timeout or failure after dispatch conservatively retains reserved capacity until the next UTC reset, because inference might have run before the failure reached OVYX.
- User-facing provider availability and admin status checks in free-only mode report the Cloudflare engine without probing third-party provider APIs. Explicit external provider tests are disabled in that mode.

## Verification before release

1. Confirm the Pages binding named `AI` exists in production and preview environments as needed.
2. Confirm `OVYX_AI_ENGINE_MODE=cloudflare-free-only` is set and that the project remains on Workers Free for hard zero-overage protection.
3. Test active PRO/MAX, free, expired, canceled, refunded, and missing-profile accounts.
4. Confirm no model request is sent for unauthenticated, unpaid, misconfigured, over-budget, rate-limited, or ledger-unavailable requests.
5. Confirm native OVYX AI and website generation both use the fixed Cloudflare model and produce useful, functioning website output.
6. Inspect build, static, and desktop/mobile browser results for the exact commit. A passing mock test or health check alone does not prove real AI generation works.

## Existing user connections and legacy provider settings

Existing third-party secrets and Universal Connections are not deleted or rewritten by this code change. They are not used by free-only AI generation. Keep existing encrypted connection settings and `OVYX_CONNECTION_ENCRYPTION_KEY` unchanged.

Successful assistant turns retain the existing server-side history path:

`users/{uid}/aiConversations/{conversationId}/messages/{messageId}`.

Firebase Admin continues to use `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT` for its server-only service account.
