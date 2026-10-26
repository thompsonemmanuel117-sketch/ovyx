# OVYX Live Website Acceptance: Owner Configuration

The live acceptance workflow intentionally does not fabricate successful evidence. It generates four model-produced websites, checks them in Chromium at 320, 390, 768, 1024 and 1440 pixels, evaluates the property source and enquiry destination, and produces screenshots plus JSON reports. The workflow stays blocked until real services and delivery evidence are available.

Keep AI/provider, property-source and enquiry-service credentials in **Cloudflare Workers & Pages → your OVYX Pages project → Settings → Variables and Secrets**. The live evaluator reads only the specific approved public/plain-text acceptance settings described below. GitHub Actions variables are supported as a fallback for public URLs and approvals; GitHub is never given an AI-provider key or private service token. Never commit credentials into source code or put them in a public URL.

## 1. AI provider keys stay in Cloudflare

**Do not copy provider API keys into GitHub Actions.** OVYX's existing production Pages runtime already has its AI provider configuration. Live acceptance now calls a narrowly scoped Cloudflare Pages Function using a short-lived GitHub Actions OIDC token; the function selects a configured provider from the Cloudflare runtime and never returns provider credentials.

Keep the existing values under **Cloudflare Workers & Pages → your OVYX Pages project → Settings → Variables and Secrets** untouched. This applies to `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, the `AI` binding and `OVYX_CONNECTION_ENCRYPTION_KEY`. Do not replace or regenerate existing keys for this evaluation.

The workflow's Cloudflare API settings (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_PROJECT`) are the existing control-plane settings used to discover the canonical Pages hostname. The API token needs Pages Read for project lookup. Do not place model-provider keys in these GitHub settings. OIDC access is restricted to this repository ID, the `main` ref, and this exact workflow file; pull-request and feature-branch tokens are rejected.

Optional Actions variable: `OVYX_EVAL_MODEL`. Leave blank to use the existing provider adapter's model configuration. The manual workflow's provider selector chooses which *Cloudflare-configured* provider to use; it does not accept or store a key. The selector now offers `cloudflare-workers-ai` directly and defaults to that existing Cloudflare `AI` binding, alongside an explicit `automatic` routing option. This avoids making the previously rate-limited Gemini route the default acceptance target when the production Cloudflare Workers AI route has successfully answered a real readiness prompt.

The manual workflow also has an `operation` selector:
- `preflight-only`: sends only the small provider readiness request, writes `provider-preflight-report.json`, and skips all website generation, browser tests, listing checks, and enquiry-delivery probes. Use this first when checking whether a provider has recovered.
- `full-acceptance`: runs the four-site generation and the usual browser/integration/audit gates after preflight succeeds. You must explicitly select this mode; the safe default is `preflight-only`.
Push-triggered live workflow runs are also preflight-only: they never start four-site generation merely because a provider is healthy. A preflight-only success proves only that the selected route returned a short real model response. It is not a substitute for full acceptance evidence.

## 2. Authoritative property records

Cloudflare production plain-text variables (preferred) or Actions **variables** (fallback):

- `OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL`: HTTPS JSON feed that the generated property website can fetch from a browser. It must return records without an API key embedded in the URL, and support the site's browser request/CORS requirements.
- `OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY`: set to `authoritative` only after the owner confirms that the feed is the real source of record.
- `OVYX_EVAL_LISTINGS_JSON_PATH`: optional dotted path to the record array, e.g. `data.properties`.
- `OVYX_EVAL_LISTING_ID_FIELD`, `OVYX_EVAL_LISTING_TITLE_FIELD`, `OVYX_EVAL_LISTING_LOCATION_FIELD`, `OVYX_EVAL_LISTING_STATUS_FIELD`: optional dotted paths when the source uses non-standard field names.

**Do not put private listing-source URLs, bearer tokens or vendor API keys in GitHub Actions.** The live workflow reads the browser-safe public feed as its source for verification. When the real property system requires authentication, put that token in Cloudflare Secrets and expose a restricted, read-only public-safe proxy from the OVYX Cloudflare runtime; only the safe proxy URL belongs in the Actions variable.

The client reads only the allow-listed names above from the Cloudflare **production** `plain_text` configuration; preview settings and all `secret_text` values are ignored. The client writes only sanitized public URLs, field paths and approval flags to workflow outputs so the browser/integration steps use exactly the same resolved settings as generation. It never sends provider keys, listing tokens, enquiry tokens or recipient addresses to the generated-site endpoint.

The evaluator recognizes active statuses `active`, `published`, `available`, `live`, `for sale`, `for rent`, `listed`, and `open`. It recognizes inactive statuses `inactive`, `sold`, `rented`, `leased`, `withdrawn`, `unavailable`, `archived`, `deleted`, `expired`, `off market`, `closed`, `draft`, and `unpublished`. Unknown status values block confirmation until they are normalized. Confirmation requires the full feed (up to 1,000 records) to have recognized statuses, every active record to have a stable ID/title/location, the generated site to request the configured feed, at least one active record to be visible on the generated property page, and no inactive record to appear as active.

## 3. Owner-approved enquiry delivery

Cloudflare production plain-text variables (preferred) or Actions **variables** (fallback):

- `OVYX_EVAL_PUBLIC_ENQUIRY_URL`: owner-approved HTTPS browser-safe form destination. Do not include a credential-bearing query string or private webhook token.
- `OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE`: must be exactly `true` before external delivery tests are allowed.

Actions **secret**:

- `OVYX_EVAL_ENQUIRY_TEST_RECIPIENT`: an inbox/address controlled by the owner and reserved for QA. This value is used only to test the generated form and is not a vendor API key.

The public endpoint must accept the QA test contract (`source: "OVYX QA"`, `test: true`, `dryRun: false`), route that test only to the controlled QA recipient, and return an explicit delivery receipt such as `delivered: true` or `deliveryStatus: "delivered"`. A 2xx response, accepted status, or queued status alone is not proof. One server-side test and each generated public-form test can create a real QA message, so enable the probe only after approving those controlled test deliveries.

**Do not place private enquiry endpoint URLs, bearer tokens, webhook tokens or vendor API keys in GitHub Actions.** When a destination requires credentials, store them in Cloudflare Secrets and use a Cloudflare-side proxy to authenticate upstream and return only a safe result/receipt. Keep the public proxy URL credential-free.

The local `/.well-known/ovyx-qa-enquiry` receiver is a separate isolated browser test. It proves form behavior only and never counts as external delivery.

## 4. What must be configured without exposing service credentials

The workflow intentionally consumes only browser-safe URLs and owner approvals from GitHub Actions variables. It does not accept private source tokens or service API keys from GitHub.

For a private property database that requires a token, create or use an owner-controlled Cloudflare-side proxy that reads the real credential from Cloudflare Secrets and returns only public-safe listing fields. Point `OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL` at that proxy and set `OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY=authoritative` only after confirming it is the real source of record. Do not place a token in a query string or in a browser URL.

For an enquiry destination that requires credentials, use an owner-controlled HTTPS proxy that keeps those credentials in Cloudflare Secrets. Set `OVYX_EVAL_PUBLIC_ENQUIRY_URL` to its public browser-safe URL. It must route `source:"OVYX QA"`, `test:true`, `dryRun:false` submissions only to the controlled QA recipient and return an explicit receipt. The Actions variable `OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE` must be exactly `true` before any external probe is sent. The controlled recipient is used only as a QA test address, never as an API key.

No existing Cloudflare keys need to be renamed, removed or replaced. Add new variables/secrets only when the owner has confirmed the real source/destination and required access policy.

## 5. Production troubleshooting record

### Current verified status — 2026-10-26

The full-acceptance attempt at [run 40364547863](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40364547863), using main commit `020eb693463f5ef44300f4231b3c3c2c6d65a506), received a real model response during preflight but failed its first full site-generation request. The returned failure was `cloudflare-ai-budget-ledger-unavailable`; no real generated-site artifacts were produced and the browser/artifact acceptance gates correctly remained open.

A follow-up source investigation found that `recordCloudflareFreeExhaustion` retried HTTP 409 / Firestore precondition conflicts in a tight loop without the bounded jitter already used by the other ledger operations. A simultaneous burst of Workers AI requests that hit the account's daily free allocation could therefore fail to persist the shared exhaustion marker and replace the underlying quota error with a generic ledger error. That path was fixed and regression-tested in [commit 18f6e062](https://github.com/thompsonemmanuel117-sketch/ovyx/commit/18f6e062fe20e08bc4c3d0b94f4e41d8ab7e5d06).

The latest post-fix provider check, [run 40366125186](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40366125186), returned a real short response from `@cf/meta/llama-3.1-8b-instruct-fp8-fast`. It ran in `preflight-only` mode and explicitly reported `realSitesGenerated: 0`; it is provider readiness evidence, not a website-generation pass. A fresh full-acceptance retry is the next evidence gate.

The production Cloudflare diagnostic for current main commit `708ad6464f9cdd190114c43ad2fa43a92b4d2a9f` reports a healthy deployment, a configured Workers AI binding, a configured Firebase service-account shape, and no deployment-log errors. Service-account authentication itself remains unverified by the health endpoint.

The live-acceptance public settings remain unconfigured:

- An authoritative listings/property source and its client-safe public feed endpoint.
- An owner-approved enquiry destination and a client-safe submission endpoint.
- Explicit authorization for the external enquiry probe and a dedicated owner-controlled test recipient.

Even if full website generation and visual/browser checks pass, those missing integrations must remain open until the owner configures and verifies them. Do not expose credentials, invent listing records, or claim enquiry delivery without a confirmed receipt. The free-only AI cap stays enabled; do not enable paid-capped billing just to force an acceptance pass.
## 6. Run and review the evidence

1. Merge only after the targeted code and regression checks pass. A PR run intentionally does not call production generation or send test enquiries.
2. A trusted `main` push or a manual workflow run on `main` starts with a provider-readiness preflight through the existing production Cloudflare runtime. The preflight sends a fixed, very short text request with a maximum of eight output tokens; it can incur small provider usage charges. Push-triggered runs and the manual workflow default to `preflight-only`, so they stop after that request. Only explicitly selecting `full-acceptance` in a manual run proceeds to the four-site run. Select a specific provider to check only that route. A `preflight-only` run stores `provider-preflight-report.json` and skips site generation, browser tests, real listing checks, and enquiry-delivery probes.
3. If preflight fails, the client stops before sending any full website briefs and prints only allow-listed provider names, failure categories, and HTTP statuses. Fix the underlying authentication, billing, quota, model/runtime, or account configuration before retrying; do not treat a configured secret name as proof that the credential works.
4. If preflight succeeds in `full-acceptance` mode, the client proceeds with the four current evaluation examples through OVYX's production multi-page builder. A successful preflight-only run never counts as full acceptance. The preflight is only a provider-reachability check; it does not certify arbitrary-brief handling, site quality, listing provenance, enquiry delivery or human review.
5. Download the `ovyx-live-generation-evidence` artifact. It contains the generated website files, screenshots, browser report, integration report and acceptance audit when those artifacts were actually produced.
6. Resolve every blocker and rerun until the live gates pass. Inspect the generated sites and screenshot sets; automated checks do not replace editorial judgement.
7. Keep `humanVisualReviewCompleted` and `humanEditorialReviewCompleted` false until an actual human review has been performed and recorded.

A successful fixture/unit-test run or provider preflight is not live website generation, verified listing data, delivered enquiries or human visual review. Those claims must be backed by artifacts from the trusted main workflow and evidence from the owner-approved source/delivery systems.
