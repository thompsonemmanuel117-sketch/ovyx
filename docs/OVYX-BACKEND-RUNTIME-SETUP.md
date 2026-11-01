# OVYX per-project disposable backend runtime

The Web Studio Quality Inspector can now send a project's declared backend checks to a dedicated Cloudflare Sandbox Worker. The runtime executes the generated Cloudflare Pages Functions against a fresh local Pages/D1 environment, applies D1 migrations, and tests API status, CRUD behavior and synthetic authorization/tenant isolation. Each run receives a unique disposable sandbox and destroys it after the report is produced.

## Required Cloudflare capability

Cloudflare Sandboxes/Containers are available on a Workers Paid plan. The runtime uses a Linux microVM with public Internet disabled by default. During dependency installation only, an outbound allowlist/proxy permits read-only package downloads from registry.npmjs.org; that route is removed before backend code is executed. No OVYX production database, API-provider credential, payment provider or external customer integration is passed into the sandbox.

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

- Only files needed for Cloudflare Pages backend testing are sent: Wrangler config, package manifests/lockfiles, functions/, migrations/, and the QA plan.
- .env, .dev.vars, private keys, common API-key/token patterns, and secret-like QA payloads are rejected.
- Project dependencies are installed with lifecycle scripts disabled. Package registry access is removed before the evaluator starts.
- Each evaluation gets a fresh sandbox, synthetic QA identity and new local D1 database IDs. Supported KV/R2 bindings use local Wrangler emulation.
- Unsupported bindings, frameworks, package installs, migrations or runtime operations remain blocked; they are never reported as passed.
- The sandbox is destroyed after every run. Reports contain only bounded, sanitized check evidence.

## Supported boundary

The current evaluator executes Cloudflare Pages Functions with D1 migrations and supported local KV/R2 bindings. It intentionally blocks remote bindings, Durable Objects, external service bindings, production secrets, external delivery, real payment settlement and unsupported server frameworks. Those need their own dedicated disposable adapters before they can be marked tested.
