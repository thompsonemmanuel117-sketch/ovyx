# OVYX live website generation and acceptance gate

This workflow tests OVYX's real multi-page Web Studio builder with model-produced output. It is intentionally different from the small HTML fixtures used to test the evaluator itself.

## Required AI provider secret

Set exactly one usable provider secret under **Repository Settings → Secrets and variables → Actions → Secrets**:

- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY` (provider selection: `claude`)
- `DEEPSEEK_API_KEY`
- `OPENAI_API_KEY`

Do not commit a key to the repository or paste it into chat. The optional Actions variable `OVYX_EVAL_MODEL` pins a model; otherwise the existing provider adapter selects its normal default. Run **OVYX Live Website Generation and Acceptance Evidence** via **Actions → Run workflow** or push a commit that triggers it. If no secret is available, actual model generation is marked blocked and the quality gate fails; fixture success is not substituted.

The live generation matrix creates four separate multi-page sites:

| Evaluation site | Market settings |
| --- | --- |
| Lagos property advisory | Nigeria, `en-NG`, NGN, `Africa/Lagos` |
| Independent restaurant | United Kingdom, `en-GB`, GBP, `Europe/London` |
| Independent fashion label | United States, `en-US`, USD, `America/New_York` |
| Workflow software | Japan, `ja-JP`, JPY, `Asia/Tokyo` |

The browser QA runs actual generated files in Chromium at 320, 390, 768, 1024 and 1440 pixels; saves default and post-interaction screenshots; checks routes, overflow, resource failures, labels, obvious placeholder copy, standalone button behavior and the required QA form. A button is not counted as functional merely because it exists. The generated-site acceptance report separately identifies checks that still need a human editorial or visual review.

## Optional real-property-feed verification

Configure these Actions variables/secrets only for the actual owner-approved source:

- Variable `OVYX_EVAL_LISTINGS_API_URL`: an HTTPS JSON listing endpoint.
- Optional secret `OVYX_EVAL_LISTINGS_API_TOKEN`: bearer token used only by the server-side evaluator; never sent into generated browser code.
- Variable `OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY`: set to `authoritative` only when the endpoint is the real source of record.
- Optional variable `OVYX_EVAL_LISTINGS_JSON_PATH`: dotted path to the array when the response is not a direct array or a recognized `listings`, `properties`, or `results` field.
- Optional variables `OVYX_EVAL_LISTING_ID_FIELD`, `OVYX_EVAL_LISTING_TITLE_FIELD`, `OVYX_EVAL_LISTING_LOCATION_FIELD`, `OVYX_EVAL_LISTING_STATUS_FIELD`: dotted field paths if the source schema uses non-standard names.

Every returned record must have a stable identifier, title, location and explicit active status. The evaluator checks the returned records and browser evidence that a real record is rendered on the generated property-listings route. A URL existing, sample card, source response alone or unconfigured environment variable does not prove that real listings work. If the source returns more than 1,000 records, narrow the feed to a bounded test query before confirmation.

## Optional enquiry-delivery verification

Set these only after confirming that the endpoint and test recipient belong to the project owner:

- Variable `OVYX_EVAL_REAL_ENQUIRY_URL`: an HTTPS POST endpoint that accepts the documented QA JSON test payload.
- Optional secret `OVYX_EVAL_REAL_ENQUIRY_TOKEN`: bearer token for that endpoint.
- Variable `OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE`: set to `true` to authorize sending the explicit integration-test payload. Without this opt-in, the evaluator makes no external POST.
- Variable `OVYX_EVAL_ENQUIRY_TEST_RECIPIENT`: owner-controlled test recipient; never use a real customer's contact details.
- Optional secret `OVYX_EVAL_ENQUIRY_TEST_PAYLOAD_JSON`: endpoint-specific additional test fields, if required.

The endpoint must return a successful JSON acknowledgement such as `{ "ok": true }`, `{ "accepted": true }` or `{ "success": true }`. A local QA form submission or a remote endpoint acknowledging a request is **not** proof that an email arrived, a WhatsApp/social message was delivered, or a lead was persisted. The generic evaluator therefore keeps `realEnquiryDeliveryConfirmed` false; a provider-specific receipt/status check must be added for any provider that can report final delivery. Never test an endpoint that could create a live customer enquiry without owner approval and a test recipient.

Social profile URLs, telephone numbers, email addresses, booking links and other enquiry destinations must be supplied by the business owner. The generator must not invent recipients or imply delivery from a local-only form.

## What the reports mean

- `browser-checked-no-obvious-blockers`: automated browser checks completed for that generated artifact; not a statement of subjective visual quality.
- `needs-attention`: one or more automated checks failed. Review the issue list and screenshots before publishing.
- `automated-checks-run-human-review-and-real-integration-verification-pending`: automated checks ran, but no claim is made about human polish review or delivery through external services.
- `blocked-no-provider-secret-not-a-pass`: no real provider output was generated.
- Missing property-feed or enquiry configuration is recorded as unverified/not configured, never substituted with fake or sample data.

The uploaded artifact `ovyx-live-generation-evidence` includes generated HTML/source, screenshot sets and JSON reports. Inspect the screenshots, copy and business facts before calling a generated site production-ready; automated heuristics cannot certify typography/visual originality, grammatical naturalness, factual correctness, accessibility in every assistive technology, or real third-party message delivery.
