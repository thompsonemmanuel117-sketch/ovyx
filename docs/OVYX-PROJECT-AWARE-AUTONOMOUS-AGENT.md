# OVYX Project-Aware Autonomous Full-Stack Agent

## What this adds

The shared Web Studio Website Engine now derives a bounded Project Intelligence Map from project files supplied with both the Assistant and Gateway build requests. The map is used as server-generated model context and as a small client summary.

It can identify source-level evidence for:

- Frameworks and direct dependencies from a supplied package manifest.
- Common page entry points (HTML, Next.js app/pages router, and Svelte-style route files).
- Server API route files and declared HTTP handler methods.
- Schema and migration file paths.
- Exported component files.
- Authentication/authorization and database-access patterns.
- Provider names and requested feature patterns such as payments, booking, storage, email and newsletters.

The map contains file paths and bounded metadata, not source contents, credential values, customer data or secret values. It uses strict file/count/character limits and excludes unsafe paths and generated dependency/build directories.

## Agent behavior

The model receives instructions to inspect this map before editing, reuse existing implementations, avoid duplicate systems, consider the existing dependency graph, preserve unrelated files and require owner approval plus recovery planning for destructive data/schema changes.

The agent must distinguish an existing source reference from a working service. A provider name in source does not prove an account is connected; a database client/schema/migration does not prove that a persistent database is provisioned; and source evidence does not prove that a route runs. Existing runtime and provider verification gates remain authoritative.

## Request flow

Both Web Studio entry points pass the supplied project files into the same Website Engine planner:

- `/api/ai/assistant`
- `/api/ai/gateway`

The planner composes the new map with the existing requirement manifest, full-stack architecture, dependency graph, integration setup requirements and autonomous QA plan. The Cloudflare Workers AI-only routing boundary, Firebase identity and quota controls are unchanged. App Studio is not modified.

## Important boundary

This is a bounded source-awareness upgrade, not a claim that arbitrary customer frameworks can all be executed in production. The existing Stage 5 acceptance runner can execute supported Cloudflare Pages Functions + D1 projects in an isolated no-egress disposable runtime. The broader per-user remote sandbox and backend-feedback repair lifecycle for arbitrary frameworks/bindings remains a separate infrastructure requirement. Until that runtime evidence exists, OVYX must report the backend as unverified/blocked rather than claiming it works.
