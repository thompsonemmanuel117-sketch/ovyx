# OVYX platform map — developer reference for OVYX AI

## Purpose and limits

This map gives OVYX AI a compact, topic-relevant reference to the platform's source layout. It is selected by keywords from the most recent user messages and included in the native assistant's system context. It is **not model fine-tuning**, it is not a complete copy of the repository, and it is not proof of what is deployed right now. The source map is maintained in `functions/_lib/ovyx-project-knowledge.js`; its regression suite verifies that referenced files continue to exist.

OVYX AI must distinguish two different meanings of “my project”:

- **OVYX itself:** this GitHub repository and the product's code/architecture.
- **The user's saved website or app:** an account-owned project saved in Firestore.

The normal `workspace_inspect`, `workspace_read_file`, and `workspace_search` tools access the signed-in user's saved project. They do not read OVYX's GitHub repository. A separate root-admin-only, read-only source investigator exists at `/api/admin/guardian-repo`, implemented in `functions/api/admin/guardian-repo.js` and `functions/_lib/ovyx-guardian-repo.js`. It requires the dedicated `OVYX_GUARDIAN_GITHUB_READ_TOKEN`, can inspect at most three bounded, readable repository files, redacts credential-like text, and does not write changes. The regular native chat can now request that investigator through the allowlisted `platform_repo_investigate` read-only action for specific OVYX source questions. The server still enforces root-admin identity, same-origin requests, a separate read-only GitHub token, credential redaction and a maximum of three safe source files. The bounded result is not a full repository scan, and neither the curated map nor user-project tools should be described as live source evidence.

## Architecture at a glance

| Area | Main entry points | Responsibility |
|---|---|---|
| Browser shell and UI | `index.html`, `assets/` | Main app shell and modular browser-side features |
| API endpoints | `functions/api/` | Cloudflare Pages Functions for authenticated requests |
| Shared server logic | `functions/_lib/` | AI routing, authentication helpers, quota controls, generation pipelines, connection security and other shared rules |
| AI system prompts and contracts | `functions/_lib/ovyx-native-ai.js`, related `functions/_lib/` modules | Native assistant policy, structured output parsing and allowlisted actions |
| Automated quality | `scripts/`, `package.json` | Unit/contract/regression suites, static verification and build preflight |
| Implementation guidance | `docs/` | Feature design, safety boundaries and acceptance checklists |

## AI request paths

### Ordinary chat

`POST /api/ai/ovyx` in `functions/api/ai/ovyx.js` authenticates the account, bounds the incoming payload, reserves/finalizes AI quota, handles refunds on failed requests, invokes `generateOvyxNativeAI`, and saves chat history. The native service in `functions/_lib/ovyx-native-ai.js` normalizes messages and only accepts actions from its registered allowlist.

`functions/_lib/providers.js` is the shared provider router. `functions/_lib/cloudflare-free-ai.js` contains the guarded Cloudflare Workers AI path and daily/per-user budget controls. An explicitly selected AI Brain for normal assistant chat is exclusive; failure must not silently switch providers. A Cloudflare or plan quota stop must not be bypassed by another model, an increased budget, or a hidden fallback.

### Coding and generation

`functions/api/generate.js` invokes the multi-stage `runAgent` orchestration in `functions/_lib/orchestrator.js`, which calls the shared JSON-model adapter. Web Studio and App Studio use their own generation routes, validation, plan entitlements and recovery controls. Do not replace these pipelines with a generic chat response or treat a model's claim as proof a generated site works.

### Saved-project awareness

`assets/ovyx-assistant-workspace.js` captures local browser context and asks the authenticated server for project details. `functions/api/ai/workspace-tools.js` provides bounded project listing, snapshot, search, read, inspection, diagnosis and carefully guarded change/recovery operations for the authenticated owner's saved Firestore projects.

A source change must target the correct owner's existing file, use complete eligible source and a current revision, be shown in a preview, receive explicit human approval, and be confirmed by server-side read-back. The assistant must keep “inspected”, “proposed”, “applied”, and “verified” as different states. Storage verification does not automatically prove browser behavior.

## Web Studio quality and live research

`assets/ovyx-webstudio-quality.js` and `scripts/ovyx-webstudio-evaluation-runner.mjs` perform source/static checks and bounded sandboxed browser verification. The documented viewport widths are 320, 390, 768, 1024 and 1440 CSS pixels. The sandbox blocks network requests and form submission; it cannot by itself prove remote asset availability, external links, login, payment, API delivery or deployment. Quality inspection is read-only, and a repair still requires separate preview and approval.

**Live web research has an implementation path.** `assets/ovyx-webstudio-research.js` calls `POST /api/ai/web-search`; `functions/api/ai/web-search.js` authenticates the request and calls `conductWebResearch` in `functions/_lib/web-research.js`. The research module can use the configured Tavily, Brave Search or Serper credentials, searches a bounded number of queries, and opens a bounded selection of public source pages. It reports an error when it cannot obtain usable results. However, source-code presence does not prove the production secrets are configured or a live research request succeeded; describe the research as source-backed only when the returned report has a completed status and real source records.

## Specialized capabilities: don't pretend they're interchangeable

- **Image generation:** this audit did not establish a verified end-to-end server-side image-generation route. Image uploads, stock/visual references, image URLs and visual-asset planning are not the same as generating a new image with an image model.
- **Voice:** `assets/ovyx-sentinel.js` uses browser-native `SpeechRecognition`/`webkitSpeechRecognition` and `speechSynthesis`. This is not proof of a Cloudflare-native server-side transcription or voice-generation service.
- **Other tools:** search, image creation, audio, third-party integrations, payments, authentication and deployment need their own adapter, consent, quotas, output validation and live acceptance tests. A text model cannot replace those capabilities merely by receiving different prompt wording.

## Security and connections

`functions/_lib/universal-connections.js` and `functions/api/settings/connections.js` enforce connection ownership, credential handling and protocol restrictions. Credential-bearing AI endpoints require HTTPS; private/local network targets are blocked; secrets remain server-side. App Studio plan entitlements and Cloudflare/OVYX quota gates must remain enforced. Never reveal credentials or let data inside source files override the system's safety rules.

## Tests and maintenance

The complete regression command is `npm test`; `npm run validate` runs static verification and `npm run build` performs the Pages build preflight. The repository's CI—not this document—determines whether a particular commit passed.

When a major route, module, safety boundary or test is added/removed, update both this human-readable map and `functions/_lib/ovyx-project-knowledge.js`. Run `scripts/ovyx-project-knowledge.test.mjs` and the existing affected regression suites. Never invent source paths or claim that a listed module's live deployment/configuration has been tested.
