# OVYX Cloudflare Diagnostics

The repository contains an automated GitHub Action named **OVYX Cloudflare Diagnostics**.

## Required GitHub Secrets

Add these repository Actions secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_PROJECT`

The Cloudflare API token should have **Pages Read** permission at minimum. Cloudflare documents Pages Read/Pages Write as the accepted permissions for reading projects, deployments, and deployment logs.

Do not paste the token into any repository file.

## Cloudflare configuration safety

OVYX intentionally does **not** commit a `wrangler.toml`, `wrangler.json`, or `wrangler.jsonc` file.

This is deliberate: the OVYX Pages project uses the **Cloudflare dashboard as the configuration source of truth** so production environment variables and encrypted secrets remain dashboard-managed. A Wrangler configuration committed to a Pages Git-integrated project can become a competing source of truth and overwrite dashboard-managed variables during deployment.

Production API keys and other secrets must remain in **Cloudflare Workers & Pages → Settings → Variables and Secrets**. Never add them to GitHub or a repository configuration file.

## Automatic execution

The workflow checks production deployments every 30 minutes.

## Manual execution

Open:

**GitHub → Actions → OVYX Cloudflare Diagnostics → Run workflow**

Choose:

- **production** to inspect the production deployment
- **preview** to inspect preview deployments
- optionally enter a specific Cloudflare deployment ID

The action:

1. Reads the Pages project.
2. Finds the newest deployment for the selected environment unless a deployment ID is supplied.
3. Reads the deployment status/stages.
4. Downloads the deployment history logs.
5. Extracts likely build/deployment errors.
6. Fails the GitHub job when Cloudflare reports a failed/canceled deployment stage or relevant error lines.
7. Uploads a sanitized diagnostics JSON artifact.

Cloudflare's current Pages API provides project, deployment-list, deployment-detail, and deployment-log endpoints for this workflow.


## OVYX Support Mailer

The support endpoint is:

- `POST /api/support`

It accepts the existing JSON ticket format and also `multipart/form-data` so the support UI can send attachments.

The mailer uses Resend through the server-side REST API. The browser never receives the Resend key.

Add these **new** Cloudflare Pages production variables/secrets in the dashboard:

- `RESEND_API_KEY` — store this as an encrypted secret. A sending-only Resend key is preferred.
- `RESEND_FROM_EMAIL` — the verified sender identity/domain configured in Resend.
- `RESEND_SUPPORT_TO_EMAIL` — optional comma-separated support recipients. If omitted, OVYX uses the existing support inbox `ovyxsupportteam@gmail.com`.

Do not replace the existing Cloudflare variable set when adding these values. Add only the three names above as needed, and leave every existing Firebase/API/AI secret untouched.

### Attachment safety

OVYX limits support requests to 8 MB at the HTTP layer, at most 3 attachments, 5 MB per attachment, and 6 MB combined attachment bytes.

Accepted attachment types are limited to:

- PDF
- JPEG
- PNG
- WebP
- TXT / LOG / Markdown
- CSV
- JSON

PDF and image files also pass a basic file-signature check before they are sent to the mail provider. Attachment contents are sent to Resend for delivery and are not stored inside Firestore; Firestore keeps only attachment names, types, and sizes.

### Ticket reliability

A ticket is written to Firestore before the mail notification is attempted. This means a temporary Resend outage does not erase the support request.

The ticket records:

- `notificationStatus` — `pending`, `sent`, or `failed`
- `notificationProvider` — `resend`
- `notificationMessageId` when Resend returns one

The request also uses a Resend idempotency key derived from the ticket ID, so provider retries do not intentionally create duplicate sends for the same ticket.

Cloudflare Pages Functions support native `Request.formData()` parsing for multipart forms, and Cloudflare currently allows request bodies up to 100 MB on Free/Pro plans; OVYX deliberately applies a much smaller support-specific limit for safety. 
