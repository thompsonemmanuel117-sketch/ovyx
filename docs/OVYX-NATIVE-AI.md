# OVYX Native AI workspace

OVYX Workspace Assistant now has its own server route: `POST /api/ai/ovyx`. It calls Cloudflare Workers AI through the Pages binding named `AI`; it does not require a user-provided Gemini, OpenAI, Anthropic, or DeepSeek API key.

## One-time Cloudflare setup

1. Open the Cloudflare dashboard and select **Workers & Pages**.
2. Open the OVYX Pages project (**forgeos-2k0**).
3. Open **Settings → Bindings → Add → Workers AI**.
4. Set the binding/variable name to exactly **AI** and save.
5. Redeploy the Pages project so the binding is available to Functions.

The application uses `@cf/meta/llama-3.3-70b-instruct-fp8-fast` by default. An `OVYX_AI_MODEL` environment variable may select another Cloudflare-hosted model only if its identifier starts with `@cf/`. OVYX never accepts model-provider API keys from the browser for this endpoint.

## Behavior and guardrails

- Requests are authenticated with the current OVYX Firebase session and use the existing server-side OVYX token/daily-prompt quota.
- Workspace context is account-scoped and passed from the current workspace scan.
- Model-suggested actions are filtered on the server to a small allowlist, then checked again in the browser. Arbitrary JavaScript, URLs and shell commands are not actions.
- Website construction is staged in Web Studio. The workspace assistant can prepare the brief and navigate there; it must not claim a site was built until Web Studio runs the actual build.
- If the binding is absent, `/api/ai/ovyx` returns `OVYX_NATIVE_AI_NOT_CONFIGURED` with setup guidance instead of silently falling back to an external provider.

## Cost and limits

“No third-party API key” does not mean unlimited or guaranteed zero-cost model inference. Cloudflare Workers AI runs on the OVYX Cloudflare account and remains subject to the account's current usage limits, billing/credits, model availability and OVYX's own quota controls.
