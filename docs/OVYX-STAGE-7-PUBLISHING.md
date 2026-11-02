# OVYX Stage 7 — Publishing and Deployment

## Existing publishing foundation

OVYX already provisions a Cloudflare Pages Direct Upload project per authenticated user and saved project. The Stage 7 center extends that existing flow rather than creating a second hosting system. It reuses Web Studio's existing **Publish / Deploy** menu and deployment modal; it does not add a duplicate floating publishing button.

- Preview publishing creates a uniquely named preview branch deployment.
- Production publishing deploys the saved project to its Pages production environment.
- The browser polls the authoritative deployment-status endpoint and reports success only after Cloudflare reports the deploy stage as successful.
- Production release history is loaded from the user's isolated Pages project.
- Rollback calls Cloudflare Pages' native deployment rollback endpoint. Only a successful production deployment can be selected; preview and failed releases are rejected server-side.
- Custom domains can be attached, checked, retried and disconnected through the Pages custom-domain API.
- The domain flow accepts public domains including `.com`, `.com.ng`, and subdomains. It never purchases a domain or claims ownership on behalf of a user.
- Domain validation and HTTPS readiness are reported from Cloudflare's domain status. OVYX does not mark a pending domain as HTTPS-ready.
- API access requires a verified Firebase user and the existing `cloudflareDeploy` entitlement. Project names are derived from the Firebase UID and saved project ID; callers cannot select another user's Pages project.
- Cloudflare credentials remain server-side. API responses contain release and domain metadata only.

## Custom domain setup

A user first registers a domain with a domain registrar, then connects it in the OVYX Publishing Center.

- **Apex/root domain** (for example `example.com`): Cloudflare Pages requires the domain's zone to be active in the same Cloudflare account as the Pages project. The registrar's nameservers must point to the Cloudflare nameservers assigned to that zone.
- **Subdomain** (for example `www.example.com`): create the CNAME record shown by OVYX, pointing to the Pages project's `*.pages.dev` hostname.
- Cloudflare validates the domain and provisions the certificate. The site should be treated as HTTPS-ready only when Cloudflare reports the domain as active.
- Some domains require the TXT verification record returned by Cloudflare. OVYX displays the returned verification instructions rather than inventing DNS values.

OVYX currently connects domains users already own; it does not yet sell/register domains in the product. Cloudflare's Registrar API can programmatically search, check and register supported domains including `.com`, but it is a beta workflow. It requires a Registrar-write token, an account billing profile/default payment method, a default registrant contact and acceptance of the registration agreement. A successful registration bills the OVYX Cloudflare account and is non-refundable; the API beta does not yet support renewals. Therefore, domain checkout must wait for explicit billing, registrant-consent, renewal and ownership-transfer design rather than charging the platform account on a user's behalf.

## Safety and rollback

- Rollback is a server-side operation with an explicit confirmation in the UI.
- The API fetches the selected release from the authenticated user's Pages project and verifies production environment, successful deploy stage and non-skipped status before calling Cloudflare rollback.
- The current production release is not deleted by a rollback.
- Domain names are normalized and validated; Pages/Workers hostnames, local hosts, URL paths, ports, IP addresses and wildcard names are rejected.
- Requests are same-origin, Firebase-authenticated, entitlement-gated and no-store.
- Secret values and Cloudflare authorization headers are never returned to the browser or logged by the publishing API.

## Current hosting boundary

The existing Pages upload endpoint deliberately rejects a generated `functions/` directory instead of silently publishing a website while dropping its backend. Cloudflare's Direct Upload documentation requires Wrangler for a `functions/` directory, while the `_worker.js` advanced-mode entry point is supported by Direct Upload. This Stage 7 publishing center therefore covers static Pages output and any compatible `_worker.js` output, but not generated Pages Functions folders. Full-stack deployment of generated API/database runtimes needs a production Worker/Functions target plus binding/secret provisioning; Cloudflare Workers for Platforms is the stronger multi-tenant direction because it isolates each customer's Worker. That path must be implemented and verified before OVYX advertises a generated full-stack app as production-published.

## Verification

- `scripts/ovyx-publishing-center.test.mjs` covers domain validation, international apex DNS guidance, release rollback eligibility, HTTPS readiness metadata and UI/API wiring.
- The new test is included in `npm test`.
- Production deployment and live custom-domain activation still require real Cloudflare Pages credentials and a user-controlled domain. Repository CI can verify code contracts but cannot prove a user's DNS ownership or certificate issuance.
