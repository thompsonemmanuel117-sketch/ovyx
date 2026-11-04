# OVYX — Update an existing live website by URL

## User workflow

Web Studio exposes an **Update live website** action. A signed-in owner pastes a published HTTPS link and describes the change they want.

1. The authenticated Publishing API searches only the signed-in owner's Firestore project collection.
2. A candidate project must have the supplied host in its saved deployment/domain metadata.
3. OVYX independently verifies the deterministic Pages project identity against the Firebase UID + project ID hash, then checks the actual Pages project, attached custom domains and a successful production release in Cloudflare.
4. The UI opens the exact saved project from the account. It does not scrape or attempt to reconstruct source code from the public website.
5. OVYX takes a server-side Website Management backup, gives the existing project graph to the current Web Studio build agent, runs source/quality checks and persists the verified source changes to the same account project before publishing.
6. The existing /api/deploy production path uploads to the same deterministic Pages project. The status endpoint must confirm environment=production, stage=deploy and status=success before the UI says the website was updated.
7. The current hostname remains attached to the same Pages project. No new Pages project, domain or replacement URL is created by this workflow. The stable Pages project name is saved for future lookups, including after a project rename.

## Security and recovery

- Firebase identity, verified email and the existing publishing entitlement are required.
- URL resolution parses the host only. It never fetches the user-supplied URL, follows redirects or treats a public webpage as source code.
- The resolver reads only the signed-in user's Firestore project subcollection and verifies ownerUid plus ownerEmail.
- The Pages project name must match the deterministic UID/project-ID hash prefix. Cloudflare's actual project and domain records must match the supplied host.
- A missing, ambiguous, foreign-account, pending-only or unverified production site is rejected before source files are opened.
- A server-side backup is created before AI edits. If source checks or a confirmed failed/canceled deployment occurs, the previous saved project graph is restored. If the deployment outcome is uncertain (for example, a network timeout after upload), OVYX keeps the new source saved and marks the deployment pending instead of risking a mismatch with a release that may still finish. A failed production release does not replace the previous successful release.
- Credentials remain in server-side environment bindings and are not copied into the AI prompt.
- The workflow is deliberately scoped to existing OVYX projects. A random third-party URL does not contain editable source files. Importing an external site requires a separate source import/ownership-verification flow (for example, an owner-authorized Git repository or uploaded project archive).

## Current deployment boundary

The current Pages Direct Upload path supports static assets and compatible root _worker.js output. It explicitly rejects a functions/ directory. If an AI edit requires Pages Functions or an unsupported backend binding, the updater refuses to publish and restores the prior source snapshot rather than leaving a saved project that differs from the live website. Full production deployment for generated Pages Functions, D1/KV/R2 bindings and arbitrary framework backends remains a separate production-runtime integration task; disposable D1 tests are not proof that those backends are deployed to a customer's live site.

## Global website generation

The shared Website Engine now instructs the AI to serve the audience and countries stated in the original brief rather than assuming a Nigerian market. It uses BCP 47 language tags, ISO country/currency codes, IANA timezones and locale-aware Intl formatting; it prohibits invented exchange rates, taxes, legal rules and payment-provider coverage. Provider choices must match the business's target countries and settlement availability.

The OVYX platform currently displays local NGN pricing in Nigeria and USD as its international pricing baseline. This does not mean every local currency or payment method is available in every country. Localized platform billing, region-specific payment acquiring and translated OVYX interface content remain future global-expansion work; they must be added only with real exchange-rate, provider and legal/settlement verification.

## Verification

The ovyx-live-site-updater.test.mjs test covers HTTPS URL validation, owner isolation, exact Pages/custom-domain matching, production-release proof, ambiguous matches, browser-asset syntax and the backup → AI edit → quality check → same-project production deployment contract.