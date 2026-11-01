# OVYX Stage 1 — Request intelligence

## Goal

Improve how OVYX understands complex website and application briefs before generation. This stage strengthens the existing prompt contract, experience brief, full-stack architecture planner and requirement ledger; it does not create a parallel planner or redesign the OVYX dashboard.

## Existing foundations retained

- The complete original brief remains authoritative and is passed to the generation task.
- The prompt contract extracts bounded, traceable clauses, explicit pages, exclusions and capability signals.
- Experience intelligence derives the mission, audience evidence, primary outcome, user journey and adaptive information architecture.
- The full-stack architecture planner derives application capabilities, pages, API contracts, data models, permissions, integrations and workflow contracts.
- Requirement intelligence labels each clause as required, prohibited or preference; records category, priority, confidence, architecture mapping, dependencies, conflicts and acceptance evidence.
- The unified Website Engine composes these decisions for the generation pipeline.

## Stage 1 improvement

The model-facing Website Engine plan now includes a compact `requirementSignals` entry for every retained requirement:

`[requirementId, polarity, priority, categories, mapping]`

- Polarity: `+` required, `!` prohibited, `~` preference.
- Priority: `C` critical, `H` high, `N` normal.
- Mapping: `M` linked to architecture nodes, `U` unmapped.
- Category codes are documented in the model instruction legend.

This closes a hand-off gap: previously the model received requirement excerpts and aggregate ledger counts/conflicts, but not the per-requirement polarity, priority, category and mapping classification. The compact signals let generation preserve hard exclusions and focus on critical requirements even when excerpts are shortened to fit the instruction budget.

## Safety and honesty rules

- Deterministic labels are planning signals, not a replacement for semantic reasoning or the original brief.
- The original brief remains authoritative; excerpts never replace it.
- Prohibited requirements remain hard exclusions.
- Conflicts are surfaced, not silently resolved.
- Unmapped requirements remain visible and cannot be counted as implemented.
- Source-level evidence is not runtime verification.
- Existing file boundaries, provider routing, project permissions and approval controls remain unchanged.

## Automated verification

The requirement-intelligence regression test covers:
- Required, prohibited and preference classification.
- Critical and high-priority requirement signals.
- Category and architecture-mapping hand-off to the model-facing plan.
- Preservation of the complete-brief authority rule.
- Existing negation, conflict, dependency and bounded-manifest cases.

Run with Node.js 22 or newer:

```sh
node scripts/ovyx-requirement-intelligence.test.mjs
npm test
npm run validate
npm run build
```

Stage 1 must not be called complete until the repository CI checks pass. Live semantic quality still requires evaluation against diverse real prompts; deterministic unit tests do not prove that every ambiguous or novel request will be interpreted correctly.
