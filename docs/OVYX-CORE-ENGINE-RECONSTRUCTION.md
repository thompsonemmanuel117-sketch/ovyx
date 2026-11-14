# OVYX Core Engine Reconstruction — Audit and Work Register

**Audit date:** 2026-11-01  
**Baseline:** `main` at `1a95e4d79b15e56a6cdf7c07b6cef1c8de0c00c7`  
**Upgrade branch:** `feat/ovyx-phase-2-core-engine-maximum`

## Mission

Strengthen the existing OVYX Website Engine without replacing working systems or promising impossible absolute perfection. The target is maximum practical quality: faithful brief understanding, traceable architecture, coherent page planning, dependency-aware generation, safe project-file operations, and evidence-based acceptance.

## Protected invariants

- Website-generation inference remains on the existing Cloudflare Workers AI route and its authentication, quota, budget, entitlement, accounting and refund controls.
- Firebase remains the identity, Firestore persistence and Storage foundation where already used.
- App Studio remains a separate product path; this work does not redesign or migrate it.
- Existing project edits remain scoped, previewable, approval-gated, backed up and read-back verified.
- Generated or planned source is not described as runtime-tested, connected, deployed or production-ready without the matching evidence.
- No real payment, external email/enquiry, destructive migration or production-data mutation is triggered by ordinary tests.

## Existing implementation confirmed on baseline

| Area | Existing foundation |
|---|---|
| Prompt understanding | `prompt-contract.js`: 80,000-character input bound, explicit page extraction, requirement clause manifest capped at 180, build-readiness clarification, output requirement verification. |
| Website intelligence | `experience.js`, `market-context.js`, `visual-asset-plan.js`: adaptive intent/outcome/journey, audience and brand inference, market locale/currency/timezone hints, asset planning and anti-template rules. |
| Architecture | `fullstack-architecture.js`: cross-layer graph for pages, components, API contracts, data models, integrations, security, background work, state machines and planned tests. |
| Website generation | `website-engine.js`, `studio-multipage.js`, `studio-singlepage.js`, `multi-page.js`: shared pre-generation plan, staged multi-page generation, single-page repair path, scoped-edit bypass and bounded model-plan serialization. |
| File operations | `workspace-tools.js`, `webstudio-source.js`, project graph/export modules: owner-scoped search/read/diagnosis, revision-checked approved source writes, backups, read-back, ZIP packaging and rollback foundations. |
| Quality | Static/contract tests, browser suites, generated-site evaluation, full-stack source-contract audit, Pages build checks and D1 migration smoke coverage. |

## Gaps to close — not claims that these features are wholly absent

1. **Prompt fidelity:** deterministic regex/phrase extraction is useful but cannot fully resolve negation scope, conflicting instructions, cross-turn references, ambiguous entities, hidden dependencies or nuanced acceptance criteria. Preserve the complete original brief and add a richer normalized requirement/decision record with explicit confidence and unresolved questions.
2. **Requirement traceability:** requirements currently have bounded clause excerpts and heuristic target mapping. Improve one-to-many mapping, exclusions, dependencies, acceptance evidence and explicit unmapped/unassessable states; never let a score hide omitted requirements.
3. **Website intelligence:** adaptive intelligence is concept-led and correctly avoids forced industry buckets. Strengthen audience/task inference, factual-vs-assumed data, localization, competitor/reference evidence when requested, and design rationale without turning profiles into mandatory categories.
4. **Page architecture:** explicit pages and staged batches exist. Improve inferred route completeness, page-specific responsibility, global navigation/data/component consistency, cross-page workflow continuity and route collision detection.
5. **Component/file dependencies:** the full-stack graph is architectural, not a complete source-file dependency graph. Existing file search/edit tools do not by themselves prove transitive import, stylesheet, asset and route dependency impact. This branch adds a bounded read-only file graph as the first reconstruction unit.
6. **Incremental generation:** strengthen changed-file selection and transitive impact review so a localized request does not trigger broad regeneration or leave stale dependents.
7. **File management:** preserve ownership, path safety, revision checks, backups, approval and read-back while improving inventory completeness, dependency-aware previews, conflict detection, file-level diffs and rollback confidence.
8. **Generation acceptance:** source validators and sandbox browser checks are bounded. Expand requirement-derived route/journey evidence and keep visual, accessibility, cross-browser, runtime, live integration and production deployment acceptance distinct.

## First implementation unit on this branch

- Added `functions/_lib/website-file-graph.js`: bounded, read-only extraction of relative JavaScript/TypeScript imports, CSS imports/asset URLs and local HTML references; unresolved local references; reverse dependencies; transitive changed-file impact analysis; explicit bounded/empty states.
- Integrated file graph metadata into the Website Engine plan, bounded model-facing architecture contract and client summary when project files are supplied.
- Added focused file-graph tests and Website Engine integration assertions; registered the test in `npm test`.

## Acceptance gates for this workstream

- [x] File-graph unit and Website Engine integration tests passed on exact PR head `54ae918e979d343b4ae2cb94b05460ef9805d875`.
- [ ] Requirement-intelligence classification, conflict detection and engine integration tests pass on the latest exact PR head.
- [x] Full `npm test`, `npm run validate`, `npm run build`, and Wrangler validation passed on the earlier file-graph-only head; rerun on the combined head before merge.
- [ ] Add browser-level coverage specifically for dependency-aware file-impact reporting and existing-site scoped edits. Existing Assistant Workspace and Web Studio desktop/mobile regression suites passed, but they do not yet directly assert the new file-graph result.
- [ ] Requirement-derived test cases cover long, contradictory, negative, multi-turn and unfamiliar briefs.
- [x] Existing regression coverage for Cloudflare AI routing, Firebase ownership, App Studio isolation, project persistence and approval/rollback passed on the same PR head.
- [ ] Live generation and deployed-browser acceptance are recorded separately from CI.


## Core reconstruction continuation — 2026-11-01

The current continuation branch starts from the latest merged `main` and preserves the prior PR #363 work rather than recreating it.

### Additional implementation in this continuation

- Requirement intelligence now distinguishes affirmative “do not forget” instructions from prohibitions, avoids treating comparative phrases such as “no more than” as exclusions, records negation evidence and confidence, validates requirement dependency IDs, carries explicit acceptance criteria when supplied by architecture mapping, and detects near-identical positive/prohibited clauses using bounded token similarity. This remains deterministic assistance; semantic ambiguity must still be surfaced rather than guessed.
- The read-only project file graph now resolves extensionless local page routes against common HTML, Pages Router and App Router entry files; it also records responsive `srcset` assets and JavaScript `new URL(..., import.meta.url)` dependencies.
- Integration-connection context traversal is now cycle-safe and bounded by depth and visited-node limits, preventing cyclic or adversarial context objects from causing unbounded recursion.
- The browser-local inference experiment previously present on the baseline has been removed from this continuation: lab page, model workers, client runtime, prototype tests, smoke scripts, CI workflow and related static routing/header exceptions. The product inference boundary remains Cloudflare Workers AI only. This is a cleanup of pre-existing experimental code, not a new AI provider or a new inference path.

### Continuation acceptance gates

- [ ] Requirement-intelligence tests pass, including negation scope, near-duplicate conflict detection and dependency validation.
- [ ] File-graph tests pass for route entry resolution, responsive image references, module asset references and transitive impact.
- [ ] Cloudflare-only product-boundary test passes; no browser-local model runtime or local-AI lab is shipped.
- [ ] Full `npm test`, `npm run validate`, `npm run build` and Wrangler validation pass on the exact continuation PR head.
- [ ] Relevant Assistant Workspace and Web Studio browser regressions pass on the exact PR head.
- [ ] Live generation remains Cloudflare Workers AI only and is tested separately with healthy quota/Firestore configuration; no fallback to local or third-party model inference.
- [ ] Requirement-derived browser journeys and deployed runtime acceptance are evidenced separately; source-level CI alone is not production acceptance.
