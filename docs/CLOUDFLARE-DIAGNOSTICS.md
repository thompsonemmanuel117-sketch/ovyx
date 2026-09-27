# OVYX Cloudflare Diagnostics

The repository contains an automated GitHub Action named **OVYX Cloudflare Diagnostics**.

## Required GitHub Secrets

Add these repository Actions secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_PROJECT`

The Cloudflare API token should have **Pages Read** permission at minimum. Cloudflare documents Pages Read/Pages Write as the accepted permissions for reading projects, deployments, and deployment logs.

Do not paste the token into any repository file.

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
