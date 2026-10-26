# OVYX AI — Stage 4: Cloudflare Workers AI Intelligence Benchmark

**Scope:** Evaluate OVYX through its production Cloudflare Workers AI integration. Stage 4 does not use or download a local model and must not change production AI routing just to make benchmark results pass.

## Fixed task suite

The reproducible suite in scripts/ovyx-cloudflare-ai-stage4-benchmark-cases.json contains 12 fixed tasks: arithmetic, JavaScript debugging, responsive CSS, a real Web Studio website build, multi-page architecture, safe project edits, form validation, app scaffolding, Nigerian English/Pidgin, privacy/security, strict JSON, and three-turn context retention.

The explicit live runner calls the authenticated OVYX endpoint /api/ai/assistant. It requests provider cloudflare-workers-ai with fallback stop, and requires both provider and routedProvider in the response to equal cloudflare-workers-ai. It sends no model override, does not call a third-party model API, does not download weights, and never silently retries a failed answer.

The website-build task goes through the real Web Studio mode=build route. Returned files are saved to an isolated artifacts/ovyx-stage4-cloudflare-ai/<run-id>/generated-sites/cedar-crumb directory and passed to OVYX's existing static website evaluator. A separate Playwright pass is opt-in and uses the existing isolated local test server; its default browser policy blocks external requests. Public listings and enquiry probes are disabled in the browser-evaluation child process.

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

- The Stage 4 runner and offline contract tests pass in the repository regression suite. This validates the harness contracts only; it does not create empirical model scores.
- The latest trusted four-site acceptance run [40407546570](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40407546570) passed project regression and browser-evaluator contract tests, and its Cloudflare provider preflight received a real short response from `@cf/meta/llama-3.1-8b-instruct-fp8-fast`. The subsequent first website-generation request failed with HTTP 502 because the shared Firestore AI-budget ledger read failed with a socket transport reset (`FIRESTORE_READ_TRANSPORT_FAILED`). It generated zero real site artifacts; the browser step correctly reported `not-run-no-real-artifacts`. The existing free daily budget guard remains fail-closed; do not bypass it or enable paid mode to force acceptance.
- The same run confirms that no authoritative public listing feed, owner-approved enquiry endpoint, public enquiry route, or authorized test recipient is configured. The integration evaluator therefore keeps real listings and enquiry delivery unverified. Do not use invented listing data or a fake delivery receipt to satisfy acceptance.
- The authenticated 12-task Stage 4 benchmark against `/api/ai/assistant` has still not run: no authorized `OVYX_STAGE4_FIREBASE_ID_TOKEN` is available to this runner. The live run consumes account AI allowance and writes benchmark turns to chat history, so it must be launched by an authorized operator with the required environment variables and explicit `OVYX_STAGE4_CONFIRM_LIVE_BENCHMARK=YES`. Never paste a live token into GitHub source or a chat transcript.
- Actual Android/browser/desktop device responsiveness evidence, human 0–4 task scores, consistency/recovery review, and visual/editorial site review remain uncollected. Unit tests, provider preflight, and generic browser smoke tests cannot substitute for that evidence.

The next technical gate is to restore reliable Firestore budget-ledger reads without weakening the daily cap, then run the authorized 12-task Cloudflare-only benchmark and review its generated-site and device evidence. Stage 4 must remain open until those results are recorded.
