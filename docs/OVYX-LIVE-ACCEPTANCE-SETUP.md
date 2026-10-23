# OVYX Live Website Acceptance: Owner Configuration

The live acceptance workflow intentionally does not fabricate successful evidence. It generates four model-produced websites, checks them in Chromium at 320, 390, 768, 1024 and 1440 pixels, evaluates the property source and enquiry destination, and produces screenshots plus JSON reports. The workflow stays blocked until real services and delivery evidence are available.

Configure values in **Repository → Settings → Secrets and variables → Actions**. Never commit credentials into source code or put them in a public URL.

## 1. AI provider keys stay in Cloudflare

**Do not copy provider API keys into GitHub Actions.** OVYX's existing production Pages runtime already has its AI provider configuration. Live acceptance now calls a narrowly scoped Cloudflare Pages Function using a short-lived GitHub Actions OIDC token; the function selects a configured provider from the Cloudflare runtime and never returns provider credentials.

Keep the existing values under **Cloudflare Workers & Pages → your OVYX Pages project → Settings → Variables and Secrets** untouched. This applies to `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, the `AI` binding and `OVYX_CONNECTION_ENCRYPTION_KEY`. Do not replace or regenerate existing keys for this evaluation.

The workflow's Cloudflare API settings (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_PROJECT`) are the existing control-plane settings used to discover the canonical Pages hostname. The API token needs Pages Read for project lookup. Do not place model-provider keys in these GitHub settings. OIDC access is restricted to this repository ID, the `main` ref, and this exact workflow file; pull-request and feature-branch tokens are rejected.

Optional Actions variable: `OVYX_EVAL_MODEL`. Leave blank to use the existing provider adapter's model configuration. The manual workflow's provider selector chooses which *Cloudflare-configured* provider to use; it does not accept or store a key.

## 2. Authoritative property records

Actions **variables**:

- `OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL`: HTTPS JSON feed that the generated property website can fetch from a browser. It must return records without an API key embedded in the URL, and support the site's browser request/CORS requirements.
- `OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY`: set to `authoritative` only after the owner confirms that the feed is the real source of record.
- `OVYX_EVAL_LISTINGS_JSON_PATH`: optional dotted path to the record array, e.g. `data.properties`.
- `OVYX_EVAL_LISTING_ID_FIELD`, `OVYX_EVAL_LISTING_TITLE_FIELD`, `OVYX_EVAL_LISTING_LOCATION_FIELD`, `OVYX_EVAL_LISTING_STATUS_FIELD`: optional dotted paths when the source uses non-standard field names.

**Do not put private listing-source URLs, bearer tokens or vendor API keys in GitHub Actions.** The live workflow reads the browser-safe public feed as its source for verification. When the real property system requires authentication, put that token in Cloudflare Secrets and expose a restricted, read-only public-safe proxy from the OVYX Cloudflare runtime; only the safe proxy URL belongs in the Actions variable.

The evaluator recognizes active statuses `active`, `published`, `available`, `live`, `for sale`, `for rent`, `listed`, and `open`. It recognizes inactive statuses `inactive`, `sold`, `rented`, `leased`, `withdrawn`, `unavailable`, `archived`, `deleted`, `expired`, `off market`, `closed`, `draft`, and `unpublished`. Unknown status values block confirmation until they are normalized. Confirmation requires the full feed (up to 1,000 records) to have recognized statuses, every active record to have a stable ID/title/location, the generated site to request the configured feed, at least one active record to be visible on the generated property page, and no inactive record to appear as active.

## 3. Owner-approved enquiry delivery

Actions **variables**:

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

## 5. Run and review the evidence

1. Merge only after the targeted code and regression checks pass. A PR run intentionally does not call production generation or send test enquiries.
2. A trusted `main` push or a manual workflow run on `main` triggers the live acceptance job. The client waits until the new Cloudflare Pages route is deployed before making the four fixed generation requests.
3. Download the `ovyx-live-generation-evidence` artifact. It contains the generated website files, screenshots, browser report, integration report and acceptance audit.
4. Resolve every blocker and rerun until the live gates pass. Inspect all four markets and all screenshot sets; automated checks do not replace editorial judgement.
5. Keep `humanVisualReviewCompleted` and `humanEditorialReviewCompleted` false until an actual human review has been performed and recorded.

A successful fixture/unit-test run is not live generation, verified listing data, delivered enquiries or human visual review. Those claims must be backed by artifacts from the trusted main workflow and evidence from the owner-approved source/delivery systems.
