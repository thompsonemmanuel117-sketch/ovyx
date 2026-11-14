# OVYX Guardian repository investigation

OVYX Guardian can perform a bounded, read-only investigation of the OVYX source repository and ask the existing Cloudflare Workers AI binding to reason about the inspected source. This is a first safe step toward a more capable project guardian; it is not an unrestricted autonomous coding agent.

## What it can do

- Check whether the native reasoning binding and the dedicated repository-read credential are configured.
- Search only `thompsonemmanuel117-sketch/ovyx` using the user's short issue description.
- Read at most three matching source files per investigation, each bounded to 120 KB before sanitization.
- Exclude environment files, private-key files, credential/service-account paths, build outputs, dependencies, and other unsafe paths.
- Redact common credential-like strings before source reaches the model.
- Return the inspected file paths so the owner can see the evidence used.
- Treat repository source and comments as untrusted data, and report that no code was changed.

## Required credential

Repository investigation intentionally uses a **separate, least-privilege GitHub credential** named `OVYX_GUARDIAN_GITHUB_READ_TOKEN`. Do not reuse `OVYX_SENTINEL_GITHUB_TOKEN`: that existing credential is reserved for bounded Actions metadata checks. AI provider API keys do not grant GitHub repository permissions.

To enable the feature:

1. In GitHub, create a fine-grained personal access token restricted to the single repository `thompsonemmanuel117-sketch/ovyx`.
2. Grant **Contents: Read-only** and the minimum repository metadata permission required by GitHub. Do not grant Contents write, Administration, Actions write, or workflow permissions for this read-only stage.
3. In the Cloudflare Pages project's **Production** environment variables/secrets, add a secret named exactly `OVYX_GUARDIAN_GITHUB_READ_TOKEN` with that token as its value.
4. Save it as a new secret. Do not replace, rename, rotate, or delete any existing variable or secret.
5. Redeploy the Pages project using the normal deployment process, then open the private Sentinel panel. The Guardian capability check should report repository investigation as ready.

Never paste the token into OVYX chat, source files, issue descriptions, or logs. The application returns only whether the credential is configured; it never returns the value.

## Deliberate boundaries

This endpoint does **not** write files, commit to GitHub, open pull requests, change Cloudflare configuration, rotate secrets, or deploy. It does not read private user projects or conversations. Source inspection remains disabled until the separate read-only token is configured. Later code changes should be proposed as a patch, tested on a dedicated branch, and require explicit approval before a pull request or deployment.

The 3D Guardian avatar remains a presentation layer. It does not receive extra permissions from being animated or voice-enabled.
