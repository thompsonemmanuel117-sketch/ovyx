# OVYX per-project disposable backend runtime

The Web Studio Quality Inspector can now send a project's declared backend checks to a dedicated Cloudflare Sandbox Worker. The runtime executes the generated Cloudflare Pages Functions against a fresh local Pages/D1 environment, applies D1 migrations, and tests API status, CRUD behavior and synthetic authorization/tenant isolation. Each run receives a unique disposable sandbox and destroys it after the report is produced.

## Required Cloudflare capability

Cloudflare Sandboxes/Containers are available on a Workers Paid plan. The runtime uses a Linux microVM with public Internet disabled by default. During dependency installation only, an outbound allowlist/proxy permits read-only package downloads from registry.npmjs.org; that route is removed before backend code is executed. No OVYX production database, API-provider credential, payment provider or external customer integration is passed into the sandbox.

This adapter is pinned to Sandbox SDK 0.12.14 to use its documented outbound allowlist and lifecycle API. Cloudflare maintains SDK 0.x security fixes through 2026-12-31; schedule migration to the 1.0 Durable Object container API before that date.

See the current Cloudflare Sandboxes overview: https://developers.cloudflare.com/sandbox/
Outbound traffic controls: https://developers.cloudflare.com/sandbox/sdk/guides/outbound-traffic/

## 1. GitHub deployment secrets

Add these repository Actions secrets:

- CLOUDFLARE_API_TOKEN: Cloudflare API token with Workers Scripts Edit, Workers Containers Edit and Durable Objects permissions for the OVYX account.
- CLOUDFLARE_ACCOUNT_ID: the Cloudflare account ID.
- OVYX_BACKEND_RUNTIME_SECRET: a randomly generated secret of at least 32 characters. Use the exact same value in the Worker and Pages environments. Never commit it.

The existing Pages Read-only token used by the live-generation workflow is not sufficient to deploy a Worker and its container.

## 2. Deploy the runtime

Run Actions → OVYX Disposable Backend Runtime Deployment → Run workflow. The workflow deploys the ovyx-backend-runtime Worker and its sandbox container, then stores OVYX_BACKEND_RUNTIME_SECRET as a Worker secret.

Wait for the first container image build and provisioning to finish.

## 3. Connect the Pages app

In Cloudflare Dashboard → Workers & Pages → the OVYX Pages project → Settings → Functions:

1. Add a Service binding for both Production and Preview environments.
2. Set the variable/binding name to OVYX_BACKEND_RUNTIME.
3. Select the Worker service ovyx-backend-runtime.
4. Add the secret OVYX_BACKEND_RUNTIME_SECRET with the same value used by the deployment workflow.
5. Save and allow the Pages deployment to complete.

A public HTTPS Worker URL can be used instead by setting OVYX_BACKEND_RUNTIME_URL, but the Service binding is preferred. The Pages API signs every request with a timestamped HMAC; the runtime rejects unsigned, stale or altered requests.

## 4. What is executed

The runtime now has two signed operations:

- `/evaluate`: runs the saved disposable backend QA plan against a fresh local Pages Functions + D1 environment.
- `/build-pages`: writes the validated customer Functions source into a fresh sandbox, installs declared dependencies with lifecycle scripts disabled, removes package-registry egress, and runs the pinned Wrangler Pages Functions build. It returns only a bounded `_worker.bundle` and validated `_routes.json` manifest to the authenticated OVYX Pages API route.

The customer provisioning route sends only backend source, migrations, the package manifest and a server-generated Wrangler configuration to the runtime build. Frontend/static assets are uploaded separately from the verified saved-project graph; the isolated backend container does not need access to customer browser assets.

- .env, .dev.vars, private keys, common API-key/token patterns and secret-like QA payloads are rejected.
- Each evaluation/build gets a fresh sandbox. No production database or third-party provider credential is passed into it.
- Package registry egress is removed before Wrangler compiles the Functions bundle.
- The sandbox is destroyed after each operation. Reports and error codes are bounded and sanitized.

## Supported boundary

The automated customer path currently supports Cloudflare Pages Functions with Cloudflare D1. The evaluator can emulate supported local KV/R2 bindings, but the customer deployment path does not yet provision or bind KV, R2, Durable Objects, Queues, external service bindings, production secrets, payment settlement or email delivery. Other server frameworks and selected non-D1 database providers fail closed rather than being silently rewritten. Each additional provider needs a dedicated owner-scoped adapter, isolated test environment, production binding policy and recovery plan.
