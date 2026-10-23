# OVYX Live Website Acceptance: Owner Configuration

The live acceptance workflow intentionally does not fabricate successful evidence. It generates four model-produced websites, checks them in Chromium at 320, 390, 768, 1024 and 1440 pixels, evaluates the property source and enquiry destination, and produces screenshots plus JSON reports. The workflow stays blocked until real services and delivery evidence are available.

Configure values in **Repository → Settings → Secrets and variables → Actions**. Never commit credentials into source code or put them in a public URL.

## 1. AI provider

Set at least one Actions secret:

- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY` (selected as `claude`)
- `DEEPSEEK_API_KEY`
- `OPENAI_API_KEY`

The manual workflow can select the provider. Optional Actions variable: `OVYX_EVAL_MODEL`. Leave it blank to use the provider adapter's default model.

## 2. Authoritative property records

Actions **secrets**:

- `OVYX_EVAL_LISTINGS_API_URL`: the owner's real source API, preferably a private/server-side endpoint.
- `OVYX_EVAL_LISTINGS_API_TOKEN`: optional bearer token for that source. Keep auth out of query strings.
  
Actions **variables**:

- `OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL`: HTTPS JSON feed that the generated site may call from the browser. It must be publicly browser-readable, return the active properties, and allow the site's cross-origin request where needed. Do not include secrets or credential-bearing query parameters.
- `OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY`: set to `authoritative` only after the owner confirms that the feed is the real source of record.
- `OVYX_EVAL_LISTINGS_JSON_PATH`: optional dotted path to the record array, e.g. `data.properties`.
- `OVYX_EVAL_LISTING_ID_FIELD`, `OVYX_EVAL_LISTING_TITLE_FIELD`, `OVYX_EVAL_LISTING_LOCATION_FIELD`, `OVYX_EVAL_LISTING_STATUS_FIELD`: optional dotted paths when the source uses non-standard field names.

The evaluator recognizes active statuses `active`, `published`, `available`, `live`, `for sale`, `for rent`, `listed`, and `open`. It recognizes inactive statuses `inactive`, `sold`, `rented`, `leased`, `withdrawn`, `unavailable`, `archived`, `deleted`, `expired`, `off market`, `closed`, `draft`, and `unpublished`. Other status values block confirmation until they are mapped/normalized. Confirmation requires the full feed (up to 1,000 records) to have recognized statuses, all active records to have a stable ID, title and location, the generated client to reference and request the public feed, at least one active source record to be visible on the generated property page, and no inactive record to appear on that active listing page.

## 3. Owner-approved enquiry delivery

Actions **secrets**:

- `OVYX_EVAL_REAL_ENQUIRY_URL`: owner-approved server-side test destination.
- `OVYX_EVAL_REAL_ENQUIRY_TOKEN`: optional bearer token.
- `OVYX_EVAL_ENQUIRY_TEST_RECIPIENT`: an inbox/address controlled by the owner and reserved for QA.
- `OVYX_EVAL_ENQUIRY_TEST_PAYLOAD_JSON`: optional extra JSON fields required by the approved endpoint.

Actions **variables**:

- `OVYX_EVAL_PUBLIC_ENQUIRY_URL`: HTTPS, browser-safe URL used by the generated Contact form.
- `OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE`: must be exactly `true` to authorize external delivery tests.

The endpoint must route QA-marked submissions to the owner's controlled test destination, accept the test contract (`source: "OVYX QA"`, `test: true`, `dryRun: false`), and return JSON with an explicit delivery receipt such as `delivered: true` or `deliveryStatus: "delivered"`. A 2xx response, accepted status, or queued status alone is not proof. A workflow run may send one server-side test and test submissions from each of the four generated sites; enable the probe only when those controlled test deliveries are approved. Do not use a real customer's email or send tests to an unapproved recipient.

The local `/.well-known/ovyx-qa-enquiry` receiver is a separate isolated browser test. It proves form behavior only and never counts as external delivery.

## 4. Run and review the evidence

1. Open **Actions → OVYX Live Website Generation and Acceptance Evidence → Run workflow** and choose a configured provider, or open the PR checks.
2. Download the `ovyx-live-generation-evidence` artifact. It contains the generated website files, screenshots, browser report, integration report and acceptance audit.
3. Resolve every blocker and rerun until the live gates pass. Inspect all four markets and every screenshot set; automated heuristics do not replace human visual and editorial review.
4. Keep `humanVisualReviewCompleted` and `humanEditorialReviewCompleted` false until a real human review has actually been performed and recorded.

A successful fixture/unit-test run is not a live AI generation, verified listing feed, delivered enquiry, or human visual review. Those claims must be backed by the live run's artifacts and provider/source evidence.
