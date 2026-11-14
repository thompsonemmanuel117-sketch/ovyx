# OVYX live website generation and acceptance gate

This document describes the same Cloudflare-backed live-acceptance workflow as [OVYX-LIVE-ACCEPTANCE-SETUP.md](./OVYX-LIVE-ACCEPTANCE-SETUP.md). That setup guide is the single source of truth for current variable names, safe endpoint requirements, OIDC security boundaries, and owner approvals.

## AI credential boundary

**Provider API keys remain in Cloudflare Pages Variables & Secrets.** The live workflow does not ask for or store Gemini, Anthropic/Claude, DeepSeek, OpenAI, Groq, OpenRouter or Cloudflare Workers AI credentials in GitHub Actions. It obtains a short-lived GitHub OIDC identity token and asks the narrowly scoped Cloudflare Pages evaluation route to generate a fixed, allow-listed case using the existing production provider adapter.

The endpoint verifies the OIDC signature and exact audience, repository ID/owner, main branch, workflow path, event type, expiry and token lifetime. It rejects pull-request/feature-branch identity, cross-origin browser requests, unknown case IDs and arbitrary user-supplied prompts. GET is a no-cost readiness probe and never generates a website. The endpoint also respects OVYX's existing production-integration emergency switch.

Keep every existing Cloudflare provider key and encryption secret unchanged. Do not copy, rename, regenerate, print or upload provider credential values.

## Live generation matrix

The trusted main workflow generates four model-produced multi-page sites through the same Cloudflare Pages production runtime that serves OVYX Web Studio.

| Evaluation site | Market settings |
| --- | --- |
| Lagos property advisory | Nigeria, \`en-NG\`, NGN, \`Africa/Lagos\` |
| Independent restaurant | United Kingdom, \`en-GB\`, GBP, \`Europe/London\` |
| Independent fashion label | United States, \`en-US\`, USD, \`America/New_York\` |
| Workflow software | Japan, \`ja-JP\`, JPY, \`Asia/Tokyo\` |

Each site is then opened in Chromium at 320, 390, 768, 1024 and 1440 pixels. The browser evaluator captures screenshots and checks responsive overflow, resource failures, accessible labels, obvious placeholder copy, local routes and safe interactions. Automated checks identify issues; they do not independently certify subjective design polish or editorial quality.

## Real property data

A sample, illustrative or static card does not establish a real property integration. Full confirmation requires an owner-approved authoritative source, explicit recognized active/inactive statuses, stable identifiers and required fields for active records, generated client code that requests the browser-safe feed, at least one active source record visibly present in the actual generated listings page, and no inactive record presented as active. A private token must never be passed into generated client-side code. If the existing property system requires authentication, expose only an owner-approved read-only proxy that keeps the credential in Cloudflare.

The evaluator deliberately reports real listings as unconfirmed when its authoritative source or rendered-page evidence is missing.

## Enquiries and social links

Social profile links, WhatsApp links, phone numbers, email addresses, booking links and real message submission are distinct outcomes. A link alone is not a delivered enquiry. Full delivery verification requires an owner-approved browser-safe form endpoint, an explicit opt-in for external testing, an owner-controlled QA recipient, a real QA payload (\`source: "OVYX QA"\`, \`test: true\`, \`dryRun: false\`) and an explicit provider delivery receipt. A 2xx, accepted or queued response is not sufficient. Private webhook URLs, bearer tokens and vendor API keys belong in Cloudflare Secrets behind a controlled proxy, not in a generated website or public URL.

The local \`/.well-known/ovyx-qa-enquiry\` receiver tests form behavior in isolation and never counts as real email, WhatsApp, social-message or customer-lead delivery.

## Human visual and editorial review

The acceptance report distinguishes automated checks from subjective human review. Review each of the four real generated sites and their screenshot sets; check the copy and locale, hierarchy and image composition, mobile and desktop layout, focus/keyboard paths, working buttons and navigation, social targets, listing status, form errors/loading/success states, and truthful service claims. Fix issues in the relevant production prompt/generation/evaluation code and rerun the exact case before making an acceptance claim.

The report must keep \`humanVisualReviewCompleted\` and \`humanEditorialReviewCompleted\` false until a human review is performed and recorded. A passing browser fixture is not a generated model site; a generated site is not a verified real listing feed; a working local form is not an external delivery receipt; and a provider-reported receipt is not an independent inbox audit.

## Workflow behavior

- Pull-request runs execute regression, evaluator, fixture and security-contract tests without production generation or external messages.
- A trusted \`main\` push or workflow dispatch runs four real generations using Cloudflare-held credentials, then browser, integration and acceptance checks.
- Missing service settings are reported as blocked/unverified, not silently substituted with examples or fake success.
- The \`ovyx-live-generation-evidence\` artifact retains generated files, screenshots and sanitized JSON reports for inspection.

See [OVYX-LIVE-ACCEPTANCE-SETUP.md](./OVYX-LIVE-ACCEPTANCE-SETUP.md) for the exact current configuration and execution steps.
