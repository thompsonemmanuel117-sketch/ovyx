# OVYX Sentinel — private administrator guardian

Sentinel adds an administrator-only health panel, an opt-in voice companion, saved check reports, and a separate optional Cron Worker. It is intentionally separate from Web Studio generation and does not inspect users' private project files or conversations.

## Current checks

- The public application shell returns HTML.
- `/api/health` reports the platform configuration state.
- `/api/service-status` reports integration configuration and encryption-key presence.
- The native Assistant and Sentinel JavaScript assets load successfully.
- Optional GitHub Actions monitoring checks recent workflow runs on `main` when `OVYX_SENTINEL_GITHUB_TOKEN` is set server-side. Use a read-only token scoped only to this repository's Actions metadata. Never paste the token into source code, a request, or a report.

Sentinel checks configured AI provider credentials for Gemini, Anthropic, DeepSeek, OpenAI, Groq, and OpenRouter with bounded, read-only requests. It also calls DeepSeek's documented `/user/balance` endpoint to detect whether the account reports sufficient balance, and OpenRouter's `/api/v1/key` endpoint to read key-expiry and spending-limit status when the key exposes that metadata. It stores only status codes, bounded durations, allowlisted issue codes, an OpenRouter expiry date when provided, and simple availability flags. It never stores API keys, key labels, response bodies, or numeric credit/balance amounts. A missing optional key is marked **skipped**, not treated as an outage. HTTP 401 means the provider rejected the credential (for example invalid, revoked, or expired); 403 indicates permissions/account restrictions; 402 indicates a billing/credit restriction when the provider uses that status; 429 indicates a limit or rate restriction. Network errors and timeouts are reported separately.

**Important limit:** model-list checks prove only that a key is accepted for that read-only endpoint. DeepSeek provides an explicit balance-availability flag, and OpenRouter may expose a key expiry date and remaining spending-limit status. Most providers do not expose a reliable credit-balance or expiry endpoint usable with an ordinary generation key. Sentinel therefore cannot prove that every provider has credits or that the key can generate with every model. Use the provider console for exact billing/expiry details and a controlled generation test when you need to validate the full generation permission path.

Sentinel stores bounded check IDs, endpoint paths, HTTP status codes, durations, allowlisted issue codes and required configuration *names*. It does not store HTTP response bodies, API keys, service-account material, source files, project contents, prompts, or private messages. All report reads and manual scans require a verified administrator identity; scheduled scans require a separate shared secret.

A healthy report proves only that its listed checks passed. It does not prove every user flow is correct, credentials authenticate successfully, or every integration works. The administrator can select **AI diagnosis** to analyse the latest saved Sentinel report using the existing Cloudflare Workers AI binding. The diagnosis is owner-only, rate-limited, rejects reports older than 24 hours, redacts credential-like strings, distinguishes evidence from hypotheses, and never executes model-returned instructions. It receives only bounded check identifiers, statuses, HTTP codes, timestamps, summaries, and approved configuration names. When the optional read-only `OVYX_SENTINEL_GITHUB_TOKEN` is configured, it also fetches recent GitHub Actions workflow/job/failed-step names and conclusions; it does not download raw workflow logs, source code, prompts, private project files or raw provider responses. CI names are treated as untrusted data, and unavailable CI metadata is not treated as a healthy result. If Workers AI is not configured, the feature reports that fact and does not silently switch providers. Successful diagnoses are saved as bounded history records and the owner can reopen up to ten recent diagnoses from the Sentinel panel. The UI distinguishes a completed diagnosis from a confirmed history save. This is a bounded Stage 3 diagnostic, not unrestricted autonomous intelligence.

The administrator can select **Prepare fix plan** to create a bounded, rule-based checklist from the saved check codes. Plans are advisory only: they do not inspect private workspace files or conversations, apply code patches, rotate keys, change Cloudflare settings, or deploy. AI diagnosis also does not apply fixes. Source-code repair must use the guarded development and verification workflow; encryption-key guidance explicitly warns against rotating an existing key without a migration plan.

## Voice companion

The interface is rendered only for the configured, verified root-admin identity. The API checks this identity again server-side; client-side UI visibility is not an authorization boundary.

The wake word is **OVYX**. Listening starts only after the administrator clicks **Enable wake word** and the browser grants microphone access. The administrator can pause it at any time, and speech recognition stops while the page is hidden. When supported by the browser, saying “OVYX, scan now” triggers a Sentinel scan; other spoken questions are sent to the existing OVYX native AI endpoint with only the bounded Sentinel report summary. Speech synthesis reads the answer aloud where supported.

Browser speech-recognition behaviour varies by device. The browser must remain open and active; background throttling, mobile OS restrictions, and closed-browser wake-up are not guaranteed. This is not an always-on native wake-word service. Camera permission remains disabled. Microphone access is permitted only for this same origin so the explicit opt-in feature can work.

## Scheduled monitoring

The repository includes `.github/workflows/ovyx-sentinel-scheduler-deploy.yml` for the separate `ovyx-sentinel-scheduler` Worker. It runs when Sentinel Worker/deployment workflow files change on `main`, and can also be started from GitHub Actions with **Deploy OVYX Sentinel Scheduler → Run workflow**.

A successful run uses the repository's existing Cloudflare deployment credentials, generates a new random value scoped only to `OVYX_SENTINEL_CRON_SECRET`, writes that same value to the Pages Production secret and the separate Worker secret without printing or committing it, redeploys the current Pages source so the secret is available to the Sentinel endpoint, then deploys the nested Worker configuration. The workflow verifies the 30-minute Cron trigger and makes an authenticated scheduled scan immediately; it fails unless a scheduled report is confirmed. It does not intentionally replace or delete any other Cloudflare variable or secret and does not change AI-provider routing or availability configuration.

To confirm monitoring is active, open the private OVYX Sentinel panel, choose **Check now**, and confirm the latest report includes a recently confirmed background scheduler. If that check becomes stale, inspect the latest run of the Deploy OVYX Sentinel Scheduler workflow and the last saved scheduled report. A successful source merge alone is not proof that the separate Worker is live; rely on the deployment verification and saved scheduled report.

The committed `sentinel-worker/wrangler.toml` is for the separate Worker only. The deployment workflow adds the site origin to a temporary configuration for deployment; no API secret is committed. Do not replace the root Cloudflare Pages configuration with this nested Worker config.

## Legacy branch audit

See [OVYX-LEGACY-BRANCH-AUDIT.md](OVYX-LEGACY-BRANCH-AUDIT.md) for the documented comparison and disposition of historical PRs #39, #35, #29, #21 and #17. Stale files are not copied over newer implementations merely to clear old branches.
