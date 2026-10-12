# OVYX Sentinel — private administrator guardian

Sentinel adds an administrator-only health panel, an opt-in voice companion, saved check reports, and a separate optional Cron Worker. It is intentionally separate from Web Studio generation and does not inspect users' private project files or conversations.

## Current checks

- The public application shell returns HTML.
- `/api/health` reports the platform configuration state.
- `/api/service-status` reports integration configuration and encryption-key presence.
- The native Assistant and Sentinel JavaScript assets load successfully.
- Optional GitHub Actions monitoring checks recent workflow runs on `main` when `OVYX_SENTINEL_GITHUB_TOKEN` is set server-side. Use a read-only token scoped only to this repository's Actions metadata. Never paste the token into source code, a request, or a report.

Sentinel stores bounded check IDs, endpoint paths, HTTP status codes, durations, allowlisted issue codes and required configuration *names*. It does not store HTTP response bodies, API keys, service-account material, source files, project contents, prompts, or private messages. All report reads and manual scans require a verified administrator identity; scheduled scans require a separate shared secret.

A healthy report proves only that its listed checks passed. It does not prove every user flow is correct, credentials authenticate successfully, or every integration works. A source-code repair is not part of a health scan; it must use the existing guarded development and verification workflow. The administrator can select **Prepare fix plan** to create a bounded, rule-based checklist from the saved check codes. Plans are advisory only: they do not inspect private workspace files or conversations, apply code patches, rotate keys, change Cloudflare settings, or deploy. Encryption-key guidance explicitly warns against rotating an existing key without a migration plan.

## Voice companion

The interface is rendered only for the configured, verified root-admin identity. The API checks this identity again server-side; client-side UI visibility is not an authorization boundary.

The wake word is **OVYX**. Listening starts only after the administrator clicks **Enable wake word** and the browser grants microphone access. The administrator can pause it at any time, and speech recognition stops while the page is hidden. When supported by the browser, saying “OVYX, scan now” triggers a Sentinel scan; other spoken questions are sent to the existing OVYX native AI endpoint with only the bounded Sentinel report summary. Speech synthesis reads the answer aloud where supported.

Browser speech-recognition behaviour varies by device. The browser must remain open and active; background throttling, mobile OS restrictions, and closed-browser wake-up are not guaranteed. This is not an always-on native wake-word service. Camera permission remains disabled. Microphone access is permitted only for this same origin so the explicit opt-in feature can work.

## Enable scheduled scans

A successful merge/deploy of the Pages app does **not** deploy the separate scheduled Worker automatically. Until all steps below are completed, the panel can run manual scans but must not claim background monitoring is active.

1. Let the Pages application deploy from the normal Git-integrated Cloudflare Pages project. Do not add a root `wrangler.toml` or replace Pages environment variables.
2. In the Cloudflare **Pages project > Settings > Variables and Secrets > Production**, add `OVYX_SENTINEL_CRON_SECRET` as a secret containing a newly generated random value of at least 32 characters.
3. In Cloudflare Workers & Pages, create/deploy the separate Worker using `sentinel-worker/wrangler.toml` as its config. Its name is `ovyx-sentinel-scheduler`; its Cron Trigger is every 30 minutes.
4. Set Worker variable `OVYX_SENTINEL_BASE_URL` to the canonical HTTPS origin only (for example, the deployed OVYX origin without a route or credentials).
5. Set Worker secret `OVYX_SENTINEL_CRON_SECRET` to exactly the same random value as the Pages secret. The value must be entered into the Cloudflare dashboard / secure secret prompt and never saved in GitHub.
6. Deploy the Worker with `npx wrangler deploy --config sentinel-worker/wrangler.toml` after its variables and secret are configured.
7. Sign in as the administrator, select **Check now**, then verify that a scheduled report appears after the next Cron interval. The report should show a recently confirmed background scheduler before claiming scheduled monitoring is working.

This nested Wrangler configuration names a **separate Cloudflare Worker**. It is not a Pages configuration file, contains no credentials, and has not been deployed by this repository change. Do not use a root Wrangler config for the existing Pages application; its configuration and secrets remain managed in the Cloudflare dashboard.

## Legacy branch audit

See [OVYX-LEGACY-BRANCH-AUDIT.md](OVYX-LEGACY-BRANCH-AUDIT.md) for the documented comparison and disposition of historical PRs #39, #35, #29, #21 and #17. Stale files are not copied over newer implementations merely to clear old branches.
