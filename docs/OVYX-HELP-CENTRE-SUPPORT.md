# OVYX Help Centre and Contact Support

## One product assistant

The Help Centre uses the existing OVYX AI assistant. It does not create a second chatbot or a second AI endpoint. OVYX AI continues to use the existing Cloudflare Workers AI route, project-aware context and curated source map.

The Help Centre is the product guidance destination. Contact OVYX Support is a separate routed page for reports that need the human support team. The existing assistant's negative-feedback action opens that page and carries a prefilled report draft.

## Support report delivery

The Contact OVYX Support form uses the existing `POST /api/support` endpoint and the existing support mailer. This is intentional: it preserves the Admin Support Tickets queue, server-side rate limiting, attachment validation and email notification path instead of creating a parallel ticket system.

The endpoint:
- Authenticates the Firebase account and enforces same-origin requests.
- Stores the ticket in Firestore under `support_tickets`.
- Validates up to three attachments (5 MB each, 6 MB combined), allowed MIME types and file signatures.
- Sends the ticket to the OVYX support inbox through Resend.
- Stores the notification delivery status and message ID on the ticket.
- Uses a Resend idempotency key derived from the ticket ID.
- Does not expose provider credentials or recipient selection to the browser.

The default recipient is `ovyxsupportteam@gmail.com`. Configure `OVYX_SUPPORT_EMAIL` to override it; the existing `RESEND_SUPPORT_TO_EMAIL` remains supported as a compatibility fallback.

## Cloudflare Pages configuration

Required:
- Secret: `RESEND_API_KEY`
- Environment variable: `RESEND_FROM_EMAIL` (a sender address verified in the Resend account)

Optional:
- `OVYX_SUPPORT_EMAIL` (preferred recipient override; defaults to `ovyxsupportteam@gmail.com`)
- `RESEND_SUPPORT_TO_EMAIL` (legacy recipient override if `OVYX_SUPPORT_EMAIL` is unset)

A real email delivery test requires a valid Resend API key and a sender address verified by Resend. A successful ticket submission with `notificationStatus: "failed"` means the report is saved in the Admin Support Tickets queue, but the email was not delivered; the interface must not claim otherwise.

The browser submits the authenticated report and optional attachments to the existing support endpoint. The destination and mail credentials remain server-side.
