# OVYX Help Centre and Contact Support

## Support report delivery

The existing Contact OVYX Support form submits to `POST /api/support/report`.
The endpoint authenticates the Firebase user, enforces same-origin requests,
validates bounded report fields, persists the report in Firestore under
`support_reports`, and sends a transactional email through Resend.

The default recipient is the existing OVYX root/support inbox
`ovyxsupportteam@gmail.com`. An optional `OVYX_SUPPORT_EMAIL` server
environment variable can override it. The sender must be a verified sender
configured as `OVYX_SUPPORT_FROM_EMAIL` or `RESEND_FROM_EMAIL`.

Required Cloudflare Pages secrets/environment:
- `RESEND_API_KEY` (secret)
- `OVYX_SUPPORT_FROM_EMAIL` or `RESEND_FROM_EMAIL` (verified sender)
- Optional `OVYX_SUPPORT_EMAIL` (destination override; defaults to the existing root/support inbox)

Reports are recorded before delivery. Their Firestore delivery status is
`pending`, `sent`, or `failed`. A delivery failure is never shown to the
user as a successful email. The client reuses a report ID on retry, and the
Resend request uses that ID as an idempotency key to prevent duplicate sends.

The browser never receives the Resend API key or chooses the destination.
Only the verified account email is used as Reply-To when it is available.
