# OVYX Cloudflare Workers AI modes

OVYX supports two guarded Cloudflare Workers AI modes. Neither mode routes to third-party AI providers implicitly. The existing personal Universal Connection flow remains separate and requires the existing user action/consent.

## Existing free-only mode

Keep `OVYX_AI_ENGINE_MODE=cloudflare-free-only` for the current protected free path. The internal budget defaults to 7,000 neurons per UTC day and remains hard-capped at 8,000 neurons. Those limits are intentionally unchanged by this upgrade.

## Optional paid-capped mode

The new mode is deliberately opt-in and is **not enabled by a repository change**. Use it only after the Cloudflare account has Workers Paid billing enabled and you have reviewed the current Cloudflare pricing.

Set these Cloudflare Pages/Workers runtime variables in the production environment:

- `OVYX_AI_ENGINE_MODE=cloudflare-paid-capped`
- `OVYX_WORKERS_AI_DAILY_NEURON_BUDGET=12000`

Keep the existing Workers AI `AI` binding and Firebase service-account configuration in place. Do not place tokens, service-account JSON, or credentials in source control or client-side variables. The paid-capped mode uses the same pinned OVYX Workers AI model and guarded shared daily ledger; it does not turn on `legacy-provider-routing`, and it does not silently call Gemini, OpenAI, Anthropic, DeepSeek, or another external provider.

The paid-capped value must be an explicit integer of at least 100 neurons. Missing or invalid configuration fails closed before inference. OVYX clamps the value to **15,000 neurons per UTC day maximum**. A recommended first trial is 12,000 neurons per day; watch real usage and generated-site acceptance evidence before increasing it. The code change alone does not enable billing or change deployed runtime settings.

## Cost guard notes

Cloudflare currently lists 10,000 free Workers AI neurons per day and, on the Workers Paid plan, usage beyond the free allocation is charged at the published neuron rate. Pricing and allocation can change; verify the Cloudflare dashboard/pricing page before enabling billing.

At the current published rate of $0.011 per 1,000 neurons, 12,000 neurons would cost at most about $0.132/day ($3.96 for 30 days) if all 12,000 were billable; 15,000 neurons would cost at most about $0.165/day ($4.95 for 30 days), before the Workers Paid base fee and any other account usage. Actual charges depend on the account's shared daily free allocation and other Workers AI usage. A project-local limit cannot cap inference performed by other Workers or services using the same Cloudflare account.

Official references:

- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Workers Paid plan](https://developers.cloudflare.com/workers/platform/pricing/)

## Ledger behavior

The daily ledger is isolated in `system/ovyx-workers-ai-budget` and uses conditional writes. The paid-capped mode can reopen a same-day marker created solely by OVYX's former free-mode safety cap when recorded usage remains below the explicitly configured paid cap. It still blocks when Cloudflare itself reports that the account's free daily allocation has been exhausted, and it never bypasses the configured hard cap.

Failed requests and unusable model outputs are reconciled conservatively: an inference that may have been dispatched is accounted against the estimate, and an empty response with reported token usage is settled using that usage. This prevents stale reservations from indefinitely consuming apparent capacity.

## Full-stack website acceptance prerequisites

More AI capacity can make a complete generation run possible, but it does not create real merchant integrations. To pass the full acceptance run, separately configure and verify:

1. An authoritative inventory/listings source and a public, client-safe read endpoint.
2. An owner-approved server-side enquiry destination, a client-safe submission route, and an explicit delivery receipt for the owner-controlled test recipient.
3. Explicit authorization for the external enquiry probe and a real browser inspection of the generated artifacts.

Do not mark live listings, checkout/payment, enquiry delivery, or human luxury/design review complete without evidence. Generated copy, styling, responsiveness, route navigation, and working interactions still need to pass the existing build/browser quality gates.
