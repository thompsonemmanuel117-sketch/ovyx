# OVYX Guardian approved code patches

OVYX Guardian's patch workflow is deliberately review-first. It prepares a single-file replacement, shows a bounded diff preview, stores the exact proposal in private Firestore state, and can create a branch and pull request after the verified root administrator confirms the action. It never pushes to `main`, merges a pull request, or deploys production.

## Required configuration

- `OVYX_GUARDIAN_GITHUB_READ_TOKEN`: a fine-grained token restricted to `thompsonemmanuel117-sketch/ovyx`, with Contents read-only.
- `OVYX_GUARDIAN_GITHUB_WRITE_TOKEN`: a **separate** fine-grained token restricted to the same repository, with only Contents read/write and Pull requests read/write. Do not grant repository Administration, Actions write, Secrets access, or workflow permissions.
- The existing Cloudflare Workers AI binding `AI`.
- Existing Firebase Admin/Firestore configuration for private, expiring patch proposals.

Add each token as a new Cloudflare Pages Production secret with the exact name above. Do not replace or rename existing Cloudflare variables, the Sentinel Cron shared secret, the Sentinel Actions token, or any AI provider key. Never paste tokens into the OVYX chat or source code.

## Owner workflow

1. Ask Guardian to investigate the problem. It reports which source files it inspected.
2. Choose a source file and describe the exact desired fix. Guardian prepares a preview; no code is changed.
3. Review the proposed summary and diff. Proposals expire after 15 minutes and are tied to the signed-in root administrator.
4. Type `CREATE_PULL_REQUEST` and select **Create review pull request**.
5. Guardian re-checks that the target file has not changed, creates a dedicated `ovyx/guardian/...` branch, commits only the reviewed file to that branch, and opens a pull request.
6. Review CI and the diff. Merge and production deployment remain separate human-controlled actions.

## Safety limits

- One existing text source file per proposal, up to 24,000 characters of source and 40,000 characters of proposed content.
- Credential-like values and private-key blocks are rejected before source reaches the model or the proposed file is committed.
- Secret files, deployment configuration, workflow files, dependencies, and build output paths are blocked.
- A stale source revision, expired proposal, missing token, insufficient permission, or failed model response stops the operation.
- No automatic merge, main-branch write, production deployment, or secret mutation is implemented by this endpoint.

This provides controlled project repair, not unlimited or infallible intelligence. Guardian must still use the available model, tools, repository permissions, test evidence, and owner review.
