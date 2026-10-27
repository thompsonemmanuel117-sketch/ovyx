# OVYX Stage 4 — Intelligence acceptance checklist

This stage is complete only when the **live Cloudflare Workers AI benchmark, human quality review, generated-site checks, and intended-device checks** all have evidence. A passing unit test or a benchmark script existing in the repository is not enough.

## Non-negotiable rules

- Use the deployed OVYX assistant route, `/api/ai/assistant`.
- Cloudflare Workers AI is the required provider. Keep `fallback: "stop"`; never change providers to get around a Cloudflare limit or error.
- Do not download, install, or run local AI models for this stage.
- Do not put a Firebase ID token or any other secret in source code, a command history, screenshots, a report, or a chat message.
- The benchmark makes real authenticated requests, uses normal OVYX AI allowance, and creates benchmark conversations in the signed-in account's chat history. Run it only with owner approval and enough available allowance.
- Do not repeat a run that failed because of quota exhaustion. Save the report, resolve the quota issue through the normal Cloudflare/OVYX controls, then retry once when approved.

## 1. Run repository checks first

Use the project's existing Node.js environment (Node 22 or newer). Do not install a model or add a new AI provider.

```sh
npm test
npm run validate
npm run build
```

All three commands must pass. If one fails, record the exact failing command and error; do not hide or bypass the failure.

## 2. Run the live 12-task benchmark

You need the deployed OVYX site origin and a fresh Firebase ID token for an authorized OVYX account. Keep the token in a private environment variable/secret manager; do not paste it into code or the report.

Set these environment variables in your local shell or approved CI secret store:

- `OVYX_STAGE4_CONFIRM_LIVE_BENCHMARK=YES` — explicit confirmation that live quota and chat history will be used.
- `OVYX_STAGE4_BASE_URL=https://YOUR-OVYX-SITE-ORIGIN` — replace with the actual HTTPS origin only; no path, query string, or credentials.
- `OVYX_STAGE4_FIREBASE_ID_TOKEN` — the authorized token, supplied securely.

Then run:

```sh
npm run benchmark:cloudflare-ai-stage4
```

The script writes a report under `artifacts/ovyx-stage4-cloudflare-ai/<run-id>/report.json`. Keep the report private if answers or project details should not be shared.

The suite covers deterministic reasoning, JavaScript debugging, responsive CSS recovery, a real Web Studio build, strict multi-page JSON, minimal safe edits, form validation, mobile app planning, Nigerian English/Pidgin, privacy/security reasoning, exact-format instruction following, and three-turn context retention.

### Live-run pass checks

- All 12 task records are captured; none are skipped or blocked.
- Every task response reports both `provider` and `routedProvider` as `cloudflare-workers-ai`.
- The preflight rejects a malformed request without inference.
- The report contains usable latency metrics and no token/secret.
- Task T04 returns actual HTML files and the static site evaluation is reviewed.
- Task T12's final answer retains all four constraints: KiteDesk, navy and amber, small Nigerian businesses, and no payment processing.
- The report must not be marked complete merely because HTTP requests succeeded.

## 3. Score answer quality (human review required)

Open the report and score each task from 0 to 4 using its `reviewCriteria` and the original prompt.

| Score | Meaning |
|---|---|
| 0 | Failed, unsafe, or unusable |
| 1 | Major errors; most requirements missed |
| 2 | Partially useful but misses important requirements |
| 3 | Good; satisfies the important requirements with only minor issues |
| 4 | Excellent; complete, accurate, safe, and follows all constraints |

For each task, record `score0to4` and a short `reviewerNotes` explanation in a **copy of the report**. Do not change the captured prompts, answers, timings, provider fields, or original evidence.

**Quality threshold:** average score must be at least 3.0 and at least 10 of the 12 tasks must score 3 or 4. Averages alone are not enough. Any unsafe provider switch, secret disclosure, false claim that work ran, or serious security failure must be investigated even if the numeric threshold passes.

## 4. Check repeatability and recovery

After confirming enough allowance remains, set:

- `OVYX_STAGE4_INCLUDE_RELIABILITY=YES`

Run a fresh full benchmark with the same secure environment setup. This enables repeat probes for T01, T05, and T11 and a recovery probe. Review whether the objective checks agree between original and repeated answers; inspect the recovery answer manually. These additional requests consume allowance.

A successful malformed-request preflight followed by a valid request is useful recovery evidence, but it does **not** prove recovery from every timeout or provider outage.

## 5. Review the generated website

Inspect the actual files saved for T04 and the static evaluation findings.

If Playwright is **already available in the project's existing environment**, you may set `OVYX_STAGE4_RUN_BROWSER_EVAL=YES` for a fresh run to enable the isolated browser evaluator. Do not install new packages just for this checklist. The evaluator is intended to use its local QA endpoint and block external requests by default.

Verify:

- [ ] Bakery name, prices in naira, opening hours, and explicitly fictional sample location are present.
- [ ] Navigation links work and the contact CTA does what its label promises.
- [ ] No broken layout, dead controls, horizontal overflow, placeholder text, or serious accessibility defects.
- [ ] No unexpected external images, remote fonts, trackers, payment processing, or requests sending private project data elsewhere.
- [ ] No claim says a contact form, integration, or message was delivered unless delivery is genuinely confirmed.

Record browser evaluation status and any findings. If browser evaluation is not available, mark it **not tested**, not passed.

## 6. Test the real devices people will use

The CLI cannot measure the phone's memory or prove mobile usability. Test the deployed OVYX website on each intended physical device and browser. At minimum, test the primary Android phone and its normal browser; add every other officially supported device/browser.

For each device, record model, OS version, browser/version, network type, date/time, test outcome, and observed timings. Do not record account tokens or private conversation contents.

- [ ] Sign in and open the assistant.
- [ ] Send a short prompt and a difficult multi-part prompt.
- [ ] Ask for code debugging and a website brief.
- [ ] Continue a multi-turn conversation and verify constraints are retained.
- [ ] Check loading, timeout/error messages, retry behavior, and that a failed request is never shown as successful.
- [ ] Confirm provider status, where exposed, is Cloudflare Workers AI.
- [ ] Open Web Studio and create/preview a small test site.
- [ ] Check layout at narrow mobile width, rotate the phone if supported, scroll, open/close navigation, and use keyboard/accessibility controls where applicable.
- [ ] Record perceived response speed and any crash, freeze, excessive memory use, or layout problem.
- [ ] Confirm no model download or local model setup is requested.

Use this simple device record for each device:

```text
Device/model:
OS:
Browser/version:
Network:
Date:
Assistant prompts passed (yes/no):
Long conversation passed (yes/no):
Web Studio preview passed (yes/no):
Error/recovery behavior passed (yes/no):
Observed response times:
Memory/crash/freeze observations:
Provider confirmed Cloudflare Workers AI (yes/no/not visible):
Issues and evidence:
Overall result (pass/fail/not tested):
```

## 7. Final sign-off

Stage 4 can be marked **PASS** only after all of the following are true:

- [ ] Repository tests, validation, and build pass.
- [ ] All 12 live benchmark tasks completed through Cloudflare Workers AI only.
- [ ] Human-reviewed average is at least 3.0/4 and at least 10 tasks score 3 or 4.
- [ ] Repeatability and recovery evidence is reviewed, or any skipped optional probes are explicitly documented with a reason.
- [ ] Generated-site static findings and browser/device interactions are reviewed; no unresolved blocker remains.
- [ ] Every intended supported device has a recorded acceptable result.
- [ ] No serious security, privacy, fallback, or false-success issue remains.
- [ ] Report and device records are saved without secrets.

If the live quota is exhausted, a required device is unavailable, browser testing was not run, or answer scores are missing, the honest result is **BLOCKED / INCOMPLETE**, not PASS. Do not start Stage 5 until the sign-off list is satisfied.

## Current status note

This document defines the execution and sign-off procedure. It does not itself run the live benchmark or certify device performance. Those results must come from the deployed OVYX service and the actual target devices.
