# OVYX AI — Stage 4: Cloudflare Workers AI Intelligence Benchmark

**Scope:** Evaluate OVYX through its production Cloudflare Workers AI integration. Stage 4 does not use or download a local model and must not change production AI routing just to make benchmark results pass.

## Fixed task suite

The reproducible suite in scripts/ovyx-cloudflare-ai-stage4-benchmark-cases.json contains 12 fixed tasks: arithmetic, JavaScript debugging, responsive CSS, a real Web Studio website build, multi-page architecture, safe project edits, form validation, app scaffolding, Nigerian English/Pidgin, privacy/security, strict JSON, and three-turn context retention.

The explicit live runner calls the authenticated OVYX endpoint /api/ai/assistant. It requests provider cloudflare-workers-ai with fallback stop, and requires both provider and routedProvider in the response to equal cloudflare-workers-ai. It sends no model override, does not call a third-party model API, does not download weights, and never silently retries a failed answer.

The website-build task goes through the real Web Studio mode=build route. Returned files are saved to an isolated artifacts/ovyx-stage4-cloudflare-ai/<run-id>/generated-sites/cedar-crumb directory and passed to OVYX's existing static website evaluator. A separate Playwright pass is opt-in and uses the existing isolated local test server; its default browser policy blocks external requests. Public listings and enquiry probes are disabled in the browser-evaluation child process.

## Budgeted one-site smoke operation

The workflow also exposes a manual `stage4-site-smoke` operation for obtaining one real generated artifact before spending the larger allowance needed for full acceptance. Select it from the [OVYX live-generation workflow](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/workflows/ovyx-webstudio-live-generation.yml) on `main`.

- It is fixed to the allow-listed Nigeria baby-products evaluation case and `cloudflare-workers-ai`; the public endpoint rejects caller-supplied profiles, different case IDs, and non-Cloudflare profile requests.
- Before spending any inference, it makes an authenticated, no-inference read of OVYX’s existing daily-budget ledger. If that read reports exhaustion or cannot be trusted, it writes a small `stage4-budget-status-report.json` and stops before the model call. The check describes OVYX’s internal ledger only; it does not prove external Cloudflare provider readiness.
- It creates only two linked pages, caps planning/batch/repair output tokens, disables the optional design-polish inference, and skips the separate tiny provider preflight so that the actual site build is the first inference request after the budget check. These are smoke-only limits; the normal full-acceptance ceiling and generation settings remain unchanged.
- It forces public listings and enquiry probes off and keeps the site’s isolated QA-only form separate from real client integrations. It does not read, expose, or change provider keys, account entitlements, the global daily budget, production routing, or Universal Connection.
- It still verifies that the run’s exact source SHA has a successful production Cloudflare Pages deployment before sending a generation request. The output artifact is labelled `stage4-budgeted-single-site-smoke`. A successful smoke gate says only that one artifact was generated and evaluated in Chromium and is **awaiting human review**; it explicitly leaves the 12-task benchmark, four-site acceptance, live integrations and device review incomplete.
- If the protected daily budget is exhausted, the generation fails and the report records that result. The smoke operation does not retry a failed generation or bypass the quota guard.

This operation is a cost-aware way to secure the first actual site for human and device review. It is not a substitute for the full acceptance workflow or the authenticated 12-task assistant benchmark.

## Quota-preserving routine CI

Ordinary pushes to `main` now resolve the exact successful Cloudflare Pages deployment, inspect only the approved runtime configuration inventory, verify that the internal evaluation route is reachable, and attempt a no-inference read of OVYX’s protected daily-budget ledger. They do **not** send a model prompt and therefore do not consume the protected daily AI allowance. The separate budget report records `budget-available-no-inference`, `budget-exhausted-no-inference`, or `budget-status-unavailable-no-inference`. A failed/exhausted ledger read is informational on routine pushes but blocks an explicitly requested inference operation. The deployment report status remains `deployment-and-config-verified-no-ai-inference`; it deliberately makes no provider-readiness or model-quality claim.

Choose the operation based on the evidence needed: manual `preflight-only` first reads the protected ledger without inference, then makes one small real provider request only if the ledger is available; `stage4-site-smoke` uses the same no-inference ledger read and then starts one bounded two-page Cloudflare-generated site without an extra readiness inference; `full-acceptance` performs the separate explicit multi-site process after its protected-ledger check and provider preflight. If the ledger is exhausted or cannot be read, explicit operations stop before inference and preserve a safe status report. None of these operations bypasses the daily guard, silently changes provider, or retries a failed billable generation.

## Owner integration setup checklist

The live listing/enquiry gate is intentionally fail-closed. Configure these under GitHub **Settings → Secrets and variables → Actions** only after the relevant service owner authorizes them.

**Repository variables for the public listing feed:**
- `OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL`: an HTTPS, browser-readable feed URL with no credentials or secret query parameters.
- `OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY=authoritative`: explicit declaration that the feed is the owner-approved source of truth.
- `OVYX_EVAL_LISTINGS_JSON_PATH`: optional dotted path to the feed's record array (for example, `data.items`).
- `OVYX_EVAL_LISTING_ID_FIELD`, `OVYX_EVAL_LISTING_TITLE_FIELD`, `OVYX_EVAL_LISTING_LOCATION_FIELD`, `OVYX_EVAL_LISTING_STATUS_FIELD`: dotted field paths for stable source IDs, titles, locations and explicit active/inactive status.

The feed must return real records and stable identifiers. Generated sites must show only records the feed marks active, handle loading/empty/error states, and never substitute mock listings when the feed fails. A configured URL alone is not proof; the integration audit must see real active records rendered by the site.

**Repository variables and secret for controlled enquiry delivery:**
- `OVYX_EVAL_PUBLIC_ENQUIRY_URL`: the owner-approved HTTPS endpoint used by the generated public Contact form.
- `OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE=true`: explicit opt-in to send a controlled QA-marked test.
- `OVYX_EVAL_ENQUIRY_TEST_RECIPIENT`: a GitHub Actions **secret** naming an owner-controlled QA inbox/recipient.

The endpoint must route QA payloads marked `source:"OVYX QA"`, `test:true`, `dryRun:false` only to that test recipient, and return an explicit delivery receipt (such as `delivered:true` or `deliveryStatus:"delivered"`). HTTP 2xx, queued, or accepted by itself is not delivery proof. Never include keys, private webhook URLs, recipient addresses or auth headers in generated browser files. Run the external enquiry probe only after the endpoint owner approves the test.

These settings are not currently configured in production. Do not substitute the GitHub account email, a guessed feed, a placeholder domain, or a fabricated receipt. Until both service audits pass, live listings and real enquiry delivery stay open acceptance gates.

## Live-run safeguards

A push explicitly tagged for a one-time full acceptance uses `cloudflare-workers-ai` rather than automatic multi-provider routing, so the Stage 4 acceptance path cannot choose a different AI vendor. The trusted full-acceptance workflow also queries Cloudflare Pages deployment metadata and waits for a successful **production** deployment whose source branch is `main` and whose commit SHA exactly matches the run's source revision. If Cloudflare has not deployed that revision within the bounded wait, or its deployment fails/is skipped, the workflow stops before live AI generation. This check reads only deployment metadata; it does not read, print or change runtime secrets, provider routing, budgets, or Universal Connection settings.

The benchmark makes real authenticated requests, consumes the signed-in account's OVYX AI allowance and writes benchmark turns into separate benchmark conversations in that account's chat history. Run it only when an authorized operator explicitly approves this use.

Required environment variables:

- OVYX_STAGE4_BASE_URL: deployed OVYX origin, e.g. https://your-ovyx-domain.example. HTTPS is required except for localhost/loopback tests.
- OVYX_STAGE4_FIREBASE_ID_TOKEN: valid Firebase ID token for a signed-in account entitled to use AI. Keep it in an environment variable or secret; never put it in source code, reports or chat.
- OVYX_STAGE4_CONFIRM_LIVE_BENCHMARK=YES: explicit confirmation to use live AI quota and write benchmark conversations.

Optional controls:

- OVYX_STAGE4_INCLUDE_RELIABILITY=YES: three consistency repeats (T01, T05, T11) and a recovery-reasoning task. Repeats never replace original answers.
- OVYX_STAGE4_RUN_BROWSER_EVAL=YES: if Playwright and Chromium are installed, run the generated-site browser evaluator. The child process is not given any public enquiry/listings QA opt-in variables.

Example invocation (shell):

    OVYX_STAGE4_BASE_URL="https://your-ovyx-domain.example" \
    OVYX_STAGE4_FIREBASE_ID_TOKEN="$OVYX_STAGE4_FIREBASE_ID_TOKEN" \
    OVYX_STAGE4_CONFIRM_LIVE_BENCHMARK=YES \
    OVYX_STAGE4_INCLUDE_RELIABILITY=YES \
    npm run benchmark:cloudflare-ai-stage4

The command should be run locally by an authorized project operator with the variables configured. It is not invoked by CI, npm test, deployment workflows or any background task. The offline contract test never sends network requests.

Before inference the runner sends an intentionally invalid empty-prompt request. It must be rejected with HTTP 400 and PROMPT_REQUIRED. T01 then checks that a valid task succeeds after the rejected request. Failed inference requests are recorded as failures; the runner stops rather than using extra quota after a failed or provider-unverified response.

## Measurements and scoring

Each response records model/provider metadata, request ID, Cloudflare Ray ID if available, request/response bytes, response-header latency, total response time, output length, usage metadata and a sanitized answer. The endpoint returns JSON after generation, so response-header timing is not mislabeled as time-to-first-token.

The CLI records its own Node process RSS/heap before and after the run, but these are measurements of the benchmark process—not the user's phone, OVYX browser memory, or Cloudflare model memory. Server-side inference memory is not exposed by the current Workers AI response contract. Actual supported Android/browser/desktop devices still require separate UI responsiveness/network tests.

Score each response from 0–4 using the fixed task criteria. The proposed acceptance target is a weighted average of at least 3.0/4 with at least 10 of 12 tasks scoring 3 or 4. T01 arithmetic must be exact; T05/T11 must satisfy strict JSON checks. T04 must pass static checks and be reviewed in an isolated browser at 320, 390, 768, 1024 and 1440 CSS-pixel widths; rendered appearance and controls still require human review. Repeat objective checks should agree; T12 must retain all constraints. Any unauthorized provider routing or hard-fail privacy/security issue is a no-go.

Record latency p50/p95 and failures before finalizing the latency go/no-go threshold. The benchmark keeps failed and timed-out tasks visible. Human scores are intentionally blank until reviewers inspect actual responses.

## Current state

The runner and offline contract tests are tooling, not proof that Cloudflare AI has passed. The live run requires an authorized Firebase ID token and explicit approval to consume the account's live AI allowance. Stage 4 remains incomplete until the live task outputs are scored, generated-site quality is reviewed, consistency/recovery evidence is examined, and actual target-device evidence is recorded.

### Production evidence check — 2026-10-26

- The Stage 4 runner, its 12-task suite contract tests, and the production deployment revision-gate tests pass in the repository regression suite. These validate harness and deployment safeguards; they do not create empirical model scores.
- Earlier four-site acceptance run [40407546570](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40407546570) passed project regression and browser-evaluator contract tests, and Cloudflare Workers AI returned a short preflight response. Its first generation attempt then failed with a Firestore budget-ledger socket reset (`ECONNRESET`), and it generated no site artifacts.
- After merging the deployment gate, run [40411796002](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40411796002) verified that the exact production Cloudflare Pages deployment matched commit `c1e6325eda034ce319681b12607b739a578f94b1`. The Cloudflare-only provider preflight then received a real response from `@cf/meta/llama-3.1-8b-instruct-fp8-fast`, but the first real website-generation request failed with `OVYX_AI_NEURON_BUDGET_EXHAUSTED`. This is the protected OVYX daily neuron cap—not a reason to raise the cap or switch to paid mode. The run generated zero real site artifacts; its report correctly says `not-run-no-real-artifacts`, and the acceptance report records zero sites.
- The latest run also confirms that no authoritative public property feed, owner-approved enquiry endpoint, public browser-safe enquiry route, or QA recipient is configured. Real listing and enquiry delivery remain unverified. Do not invent listings, a destination or a delivery receipt to satisfy acceptance.
- The authenticated 12-task benchmark against `/api/ai/assistant` has still not run because no authorized `OVYX_STAGE4_FIREBASE_ID_TOKEN` is available to this runner. It consumes the signed-in test account's OVYX AI allowance and writes separate benchmark turns to that account's history. It must be launched by an authorized operator with the required environment variables and explicit `OVYX_STAGE4_CONFIRM_LIVE_BENCHMARK=YES`. Never paste a live token into GitHub source or a chat transcript.
- Actual Android/browser/desktop device responsiveness evidence, human 0–4 task scores, consistency/recovery review, and visual/editorial site review remain uncollected. Passing unit tests, the production deployment gate, provider preflight, or a browser step with no generated artifacts cannot substitute for that evidence.

Next: after the protected daily budget resets, use an authorized test account to run the 12-task Cloudflare-only benchmark, capture and score its actual outputs, and review any generated-site/browser evidence. Test Android Chrome/desktop behavior separately. If the daily cap is still exhausted, stop rather than bypassing it or enabling paid mode. Stage 4 remains open until the benchmark scores, site quality, and device evidence satisfy the acceptance criteria.
